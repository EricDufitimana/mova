"""Check presentation outputs and render local previews for visual review."""
import sys,json,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.mova/business-tools'))
import pypdfium2 as pdfium
from PIL import Image,ImageDraw
from openpyxl import load_workbook
from pptx import Presentation

folder=ROOT/'business-plan';previews=ROOT/'.mova/business-previews';previews.mkdir(parents=True,exist_ok=True)
poster=pdfium.PdfDocument(str(folder/'Mova_BMC_Poster.pdf'))
assert len(poster)==1
poster[0].render(scale=1.5).to_pil().save(previews/'canvas.png')
deck=pdfium.PdfDocument(str(folder/'Mova_Presentation.pdf'))
prs=Presentation(folder/'Mova_Presentation.pptx');assert len(deck)==len(prs.slides)==13
contact=Image.new('RGB',(1600,4*250),'#e8e5df')
for i,page in enumerate(deck):
    image=page.render(scale=.7).to_pil().convert('RGB');image.thumbnail((390,220));x=(i%4)*400;y=(i//4)*250
    contact.paste(image,(x,y));ImageDraw.Draw(contact).text((x+8,y+224),str(i+1),fill='#26352e')
contact.save(previews/'slides.png')
for page in [1,6,7,8,12]:deck[page].render(scale=1.1).to_pil().save(previews/f'slide-{page+1}.png')
report=pdfium.PdfDocument(str(folder/'Mova_Rwanda_Business_Plan.pdf'))
text='\n'.join(page.get_textpage().get_text_range() for page in report)
for term in ['2,844,640','2,850,000','84,800','3,239','25,000','1,048,600']:
    assert term in text,term
for i in [0,len(report)-1]:report[i].render(scale=1.1).to_pil().save(previews/f'report-{i+1}.png')
book=load_workbook(folder/'Mova_Financial_Model.xlsx',data_only=True)
assert book['90-day budget']['B7'].value==2844640
assert book['Scenarios']['V3'].value==-84800
assert book['Scenarios']['V4'].value==392360
assert book['Unit economics']['B10'].value==3239
assert book['90-day cash flow']['L4'].value==1048600
assert book['Break-even detail']['H2061'].value>=0
assert book['Break-even detail']['H2060'].value<0
assert book['Break-even detail']['I3241'].value>=0
assert book['Break-even detail']['I3240'].value<0
formula_book=load_workbook(folder/'Mova_Financial_Model.xlsx',data_only=False)
formulas=sum(cell.data_type=='f' for sheet in formula_book for row in sheet for cell in row)
assert formulas>80000
with zipfile.ZipFile(folder/'Mova_Presentation_Pack.zip') as archive:
    assert archive.testzip() is None
    assert len(archive.namelist())==7
summary={'deck_slides':len(deck),'canvas_pages':len(poster),'report_pages':len(report),'workbook_sheets':len(book.sheetnames),'formula_cells':formulas,'cash_and_break_even_checks':'passed','zip_integrity':'passed','previews':str(previews)}
(folder/'verification.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
