"""Build the Mova presentation pack from plan.json; no application files are changed."""
import sys, json, math, re, textwrap, zipfile
from pathlib import Path
from html import escape
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.mova/business-tools'))
import xlsxwriter
from openpyxl import load_workbook
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A3, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from docx import Document
from docx.shared import Inches as DI, Pt as DP
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

OUT=ROOT/'business-plan'
P=json.loads((OUT/'plan.json').read_text(encoding='utf-8-sig'))
I=P['inputs']; BLOCK={b['key']:b for b in P['canvas']}
money=lambda n:f'{n:,.0f}'
SETUP=sum(row[1] for row in P['setup'])
BASE_FIXED=sum(row[1] for row in P['fixed'])
NONMAP=BASE_FIXED-30000

def calc(drivers=20,days=26,rides_per_driver_day=3,fare=2500,fee_rate=.08,collection=.95,institutions=2,support_extra=0,**_):
    trips=round(drivers*days*rides_per_driver_day)
    requests=math.ceil(trips/I['completion_rate'])
    loads=requests*I['map_loads_per_request']+I['extra_map_loads']
    routes=requests*I['routes_per_request']
    api=((max(0,loads-I['maps_free'])*I['maps_usd_per_1000']/1000)+(max(0,routes-I['routes_free'])*I['routes_usd_per_1000']/1000))*I['planning_rwf_usd']
    map_budget=max(30000,math.ceil(api))
    fixed=NONMAP+map_budget+drivers*I['data_per_driver']+support_extra
    gmv=trips*fare; billed=gmv*fee_rate/(1+I['vat_deduction'])
    trip_cash=billed*collection; partner_cash=institutions*I['institution_fee']/(1+I['vat_deduction'])
    variable=trips*I['variable_cost']; cash=trip_cash+partner_cash
    shadow=I['monthly_founder_hours']*I['replacement_hour_rate']
    return dict(trips=trips,requests=requests,loads=loads,routes=routes,api=api,map_budget=map_budget,fixed=fixed,gmv=gmv,billed=billed,trip_cash=trip_cash,partner_cash=partner_cash,cash=cash,variable=variable,operating=cash-fixed-variable,shadow=shadow,economic=cash-fixed-variable-shadow)

BASE=calc(); SC=[dict(s,**calc(**s)) for s in P['scenarios']]
CAP_VARIABLE=BASE['trips']*3*I['variable_cost']
CAP_BEFORE=SETUP+BASE['fixed']*3+CAP_VARIABLE
CONTINGENCY=CAP_BEFORE*I['contingency']; CAP=CAP_BEFORE+CONTINGENCY
CONTRIB=I['fare']*I['fee_rate']*I['collection']-I['variable_cost']
BE=math.ceil((BASE['fixed']-BASE['partner_cash'])/CONTRIB)
BE_NO_PARTNER=next(n for n in range(1,10001) if calc(rides_per_driver_day=n/(20*26),institutions=0)['operating']>=0)
RUN=[]; cash=I['funding']
for month in P['ramp']:
    result=calc(drivers=I['drivers'],fare=I['fare'],fee_rate=I['fee_rate'],collection=I['collection'],**{k:v for k,v in month.items() if k!='month'})
    setup=SETUP if month['month']==1 else 0
    result.update(month=month['month'],setup=setup,opening=cash)
    cash+=result['operating']-setup;result['closing']=cash;RUN.append(result)

assert SETUP==880000 and BASE['fixed']==500000
assert BASE['operating']==-84800 and BE==2059 and CAP==2844640
assert RUN[-1]['closing']==1048600
assert SC[0]['operating']==-457360 and SC[2]['operating']==392360
(OUT/'calculated_summary.json').write_text(json.dumps({'setup':SETUP,'monthly_base':BASE,'budget_cap':CAP,'contingency':CONTINGENCY,'funding':I['funding'],'break_even_trips':BE,'scenarios':SC,'runway':RUN},indent=2),encoding='utf-8')

# ---------- Detailed report: shared content for Markdown, PDF and Word ----------
sections=[]
def section(title,paragraphs=None,table=None,headers=None):
    sections.append({'title':title,'paragraphs':paragraphs or [],'table':table,'headers':headers})

section('Executive decision',[
    P['decision'],P['pitch'],
    f'Proposed maximum cash funding: RWF {money(I["funding"])} for 90 days. The zero-revenue spending ceiling is RWF {money(CAP)}, including 15% contingency. Release only RWF 150,000 for discovery first, within the setup budget. Do not buy motorcycles.',
    f'The month-three planning case produces a RWF {money(-BASE["operating"])} cash operating shortfall; it is not profitable. Base cash break-even needs {money(BE)} completed app trips/month, about {BE/26:.1f}/day or {BE/26/20:.2f}/driver/day, with two paying institutional desks.',
    'Status: secondary research plus a working presentation prototype. No primary interviews, verified local demand, signed driver agreements, paid institutional contracts or regulatory approvals are claimed. All forecasts are assumptions, not promises.'
])
section('Spend in stages: classroom, discovery, then conditional operation',[
    'Classroom presentation only: an optional RWF 25,000 materials/data cap (printing 15,000, markers/materials 5,000, backup data 5,000), reusing the existing demo, phones and projector. These are estimates, not school charges. This amount is part of the RWF 50,000 setup materials allowance if the business pilot proceeds, not an additional funding request.',
    'Discovery first: cap spending at RWF 150,000 for research/travel and materials, already inside the RWF 880,000 setup budget. Do not spend the full pilot envelope merely because the software works.',
    'Conditional operation: release the remaining pilot funding only after evidence of local pain, a licensed operating partner, required permissions and manageable insurance/data requirements. If these conditions cannot be met affordably, present the research and prototype and stop before operating real trips.'
])
section('1. Does the problem matter?',P['problem'],[
    ['National context [S1]','Only 17% of rural households are within 20 minutes of a transport stage, versus 54% urban.','A last-mile access problem is worth investigating; this does not measure local app demand.'],
    ['Digital access [S1]','Home internet access is 19% rural versus 56% urban.','Offer assisted booking; do not assume every potential rider has usable smartphone data.'],
    ['Local corridor [S2]','ASYV directions go via Ntunga, then about nine kilometres off the main road.','Test pickup reliability on that corridor; do not infer an unmet-demand percentage.'],
    ['Actual local evidence','Not yet collected.','Measure present alternatives, wait times, no-shows and willingness to pay before expansion.']
],['Evidence','What is supported','Business implication'])
section('2. Positioning and alternatives',[
    'Proposed positioning: a dependable local pickup service with digital coordination and human backup. Negotiation, maps and payment records are features, not a defensible business on their own.',
    'The initial service area is a deliberately small ASYV–Ntunga catchment, with consenting adults. One hundred active customers and 20 licensed drivers are targets to test, not existing users. At the base volume, 100 active adults would need 15.6 completed trips each per month. At break-even that rises to about 20.6.',
    'Before setting an acquisition target, count actual staff/visitor/local-worker journeys in the permitted catchment. Do not use national population, all ASYV residents or all Rwamagana residents as paying users.'
],[
    ['Walk to rank / street hail','No app installation or commission; familiar habit.','Mova must save meaningful search/pickup effort.'],
    ['Call / WhatsApp a known driver','Trust and direct discussion at low coordination cost.','Roster availability, fallback drivers and accountable records must be better.'],
    ['YEGOMOTO [S5]','Provider describes metering, cash/cashless payment, trip IDs and complaints.','Do not claim these are unique. Check current Ntunga coverage and fees in the field; the FAQ has legacy wording.'],
    ['Other mobility providers','Competitors and new entrants may already serve the wider area.','Interview locally and request actual journeys before claiming a coverage gap. No current market-share numbers are asserted.']
],['Alternative','Existing advantage','Mova must prove'])
for n,block in enumerate(P['canvas'],1):
    section(f'3.{n} Canvas: {block["title"]}',block['detail'])
section('4. How the service and money move',[
    'Passenger requests → driver accepts lawful fare/quote → driver arrives → passenger verifies plate and shares pickup code → driver starts and completes trip → passenger pays driver directly → both acknowledge receipt → Mova reconciles its service fee weekly.',
    'The passenger fare is driver gross merchandise value (GMV), not Mova sales. If the illustrative average is RWF 2,500, the driver receives that fare after the trip and owes the proposed RWF 200 service fee only for a completed Mova-booked trip. Retained driver gross is RWF 2,300 before fuel, maintenance, existing fees and taxes; this is not net earnings.',
    'The 8% fee, 95% collection and RWF 75,000 desk subscription are hypotheses. Obtain written operator/regulatory confirmation, check incumbent fees, and test willingness to pay. Double charging drivers may make the model unacceptable even if the spreadsheet balances.',
    'Start without holding rider deposits or fare wallets. External cash/MoMo payment, provider charges and tax treatment must be confirmed with the licensed operating/payment partners. The current prototype only records acknowledgements; it does not verify money movement.',
    'If per-trip fees are rejected, test institution-funded coordination or a cooperative software subscription as an alternative business, then rebuild its economics. Do not add speculative adverts, data sales or subsidies to hide a weak core model.'
])
section('5. Lean setup budget',[
    'All amounts are RWF planning estimates unless explicitly sourced. These are not supplier quotes. The legal/compliance reserve is not an asserted permit price. RDB online business registration itself is free [S8].',
    'Research and presentation printing comprise the first RWF 150,000 release. The remainder is conditional on genuine customer pain, operator cooperation, permits/privacy requirements and an affordable safety/insurance arrangement.'
],[[row[0],money(row[1]),row[2]] for row in P['setup']]+[['TOTAL SETUP',money(SETUP),'Existing prototype reused']],['Item','RWF','Basis / limit'])
section('6. Monthly cash operating budget',[
    'This is a limited, supported daytime/peak-period pilot. The coordinator allowance is not a full-time employment or 24/7-support budget. Confirm actual staffing, payroll and support obligations before contracting.',
    'The per-driver RWF 2,000 data allowance is partial. MTN lists 3 GB/30 days at RWF 3,000 [S10]; actual consumption and driver willingness to provide a smartphone/data must be tested.',
    'The RWF 20/completed-trip provision is an incremental messaging/reconciliation/service-error estimate. It is not a quoted payment-processing fee, and not accident insurance. Full fare-processing costs are not assumed because Mova does not collect the fare.'
],[[r[0],money(r[1]),r[2]] for r in P['fixed']]+[['Driver data contribution: 20 × 2,000','40,000','Scales with drivers'],['FIXED / DRIVER SUPPORT TOTAL',money(BASE['fixed']),'Excludes per-trip variable provision'],['Variable provision at 1,560 trips',money(BASE['variable']),'1,560 × 20'],['MONTH-THREE CASH COST',money(BASE['fixed']+BASE['variable']),'Before setup, tax and founder labour']],['Item','Monthly RWF','Basis / limit'])
section('7. Funding cap, runway and hidden resources',[
    f'Conservative envelope: setup {money(SETUP)} + three months of fixed costs {money(BASE["fixed"]*3)} + variable provision for 4,680 trips {money(CAP_VARIABLE)} = RWF {money(CAP_BEFORE)}. Contingency at 15% adds RWF {money(CONTINGENCY)}, giving RWF {money(CAP)}. Round the funding request to RWF {money(I["funding"])}. This cap assumes zero customer receipts, not a promised profitable start.',
    f'Under the phased forecast below, total operating receipts are RWF {money(sum(r["cash"] for r in RUN))}, net cash used including setup is RWF {money(I["funding"]-RUN[-1]["closing"])}, and cash remaining is RWF {money(RUN[-1]["closing"])}. The remaining money includes the contingency reserve; it is not profit or permission to expand.',
    'The envelope assumes only existing licensed motorcycles, driver-funded ordinary vehicle operating costs, borrowed devices and space, and substantial founder labour. It is not a public nationwide launch budget. Get actual transport/platform permissions, insurance and hosting quotes. If mandatory incremental costs exceed the allowance/contingency, reduce the scope or seek additional funding before operation.',
    f'In-kind economic resources: 200 setup founder hours × RWF 2,500 = RWF 500,000; 60 hours/month × 3 × RWF 2,500 = RWF 450,000; two borrowed test phones valued together at RWF 200,000; shared space/power at RWF 150,000 over three months. Total shadow resource value: RWF 1,300,000. These are valuation assumptions, not cash expenses or confirmed donations.'
],[[f'Month {r["month"]}',money(r['trips']),money(r['cash']),money(r['fixed']+r['variable']),money(r['setup']),money(r['closing'])] for r in RUN],['Period','Trips','Cash receipts','Cash opex','Setup','Closing cash'])
section('8. Unit economics and break-even',[
    'Base inputs: 20 drivers × 3 completed app trips/driver/day × 26 days = 1,560 trips/month. Average fare RWF 2,500 is illustrative and must be replaced with measured lawful fares, not the prototype card price.',
    'GMV = RWF 3,900,000. Billed commission = 8% × GMV = RWF 312,000. At 95% collection, trip cash receipts = RWF 296,400, with RWF 15,600 uncollected. Add two desks × RWF 75,000 = RWF 150,000; total cash receipts = RWF 446,400.',
    'Per completed trip: billed fee 200 × collection 95% = 190 cash receipts, minus variable provision 20 = RWF 170 contribution before fixed costs. Cancelled rides contribute no fee. A discounted or negotiated fare reduces this contribution; lower fare is not free to the platform.',
    f'Base cash break-even: CEILING((500,000 − 150,000) / 170) = {money(BE)} completed trips/month. That is {BE/26:.1f}/day or {BE/26/20:.2f}/driver/day. Google usage at this point still fits the modelled RWF 30,000 maps floor, so the fixed-cost formula is consistent for the base case.',
    f'Without institutional receipts, the workbook recalculates map/routing costs at every candidate volume. The first non-negative base cash result is {money(BE_NO_PARTNER)} trips/month, about {BE_NO_PARTNER/26/20:.2f}/driver/day. The simple fixed-cost shortcut would understate this because higher traffic makes Google usage chargeable.',
    'Driver economics matter separately. Measure incremental trip income after all platform/meter fees, fuel/charging, maintenance, data and lost waiting time. More app trips do not automatically mean better take-home pay. No driver salary guarantee is assumed.'
])
section('9. Scenarios: cash surplus is not accounting profit',[
    'All cases are hypotheses with no signed buyers. The expansion case spans more partner sites and ranks; it is not a forecast that one small corridor can generate this demand. Its support uplift and map costs increase rather than staying artificially fixed. Expansion working capital and approvals must be funded separately; the pilot cap does not authorize expansion.',
    'Amounts below are monthly cash operating results before setup, income tax, depreciation and additional unquoted mandatory costs. Subtracting RWF 150,000/month shadow founder labour gives an economic operating comparison, not a tax return.'
],[[s['name'],str(s['drivers']),money(s['trips']),money(s['cash']),money(s['fixed']+s['variable']),money(s['operating']),money(s['economic'])] for s in SC],['Case','Drivers','Trips','Cash receipts','Cash cost','Cash result','After founder time'])
section('10. API, pricing and tax sensitivity',[
    'Google [S9]: the planning model uses 10,000 free monthly events for each relevant Essentials SKU, then USD 7/1,000 Dynamic Maps events and USD 5/1,000 Compute Routes events within the modelled volume tier. More advanced routing and other SKUs can cost more. Prices and aggregate billing-account usage must be checked before purchase.',
    'Usage assumption: 80% request completion; four map loads and two route requests per attempted request; plus 1,000 non-trip map loads/month. These are budget assumptions, not measured logs. Browser reloads, previews, failures and visitors can materially increase events. Geocoding/other SKUs are not treated as unlimited; confirm event counts and include any overage before increasing traffic.',
    'The FX input of RWF 1,600/USD is only a conservative planning conversion, not a claim about the spot rate. The model uses the larger of its API estimate and a RWF 30,000 monthly reserve. At pilot month three the event estimate stays within the listed free caps; at the expansion hypothesis the calculated maps/routes estimate is RWF 293,440/month.',
    'Set API quotas, monitor billed usage, restrict the key and control unnecessary map reloads. Budget alerts are not spending caps. Do not switch to a public tile service expecting unlimited commercial usage; check its terms and service capacity.',
    'RRA publishes VAT thresholds of RWF 20 million over 12 months or RWF 5 million in three consecutive months [S11]. Have an accountant confirm whether Mova is agent or principal, taxable platform receipts, EBM/invoicing and income-tax treatment. Fare GMV is not automatically the taxable platform turnover.',
    'The model base VAT deduction is 0, not a declaration of exemption. If displayed service prices become VAT-inclusive with standard 18% applying [S12], set the workbook VAT deduction to 18%: commission and desk receipts available for operations fall. Supplier/import taxes may also change costs. No net-after-tax profit is asserted.',
    'At a RWF 2,000 average fare and otherwise unchanged base terms, contribution is RWF 132/trip rather than RWF 170. At RWF 1,500 it is RWF 94. Fixed-budget break-even estimates rise to 2,652 and 3,724 trips/month respectively; API overage may raise them further. A ten-percentage-point drop in fee collection at the base fare removes RWF 20 contribution/trip.'
])
section('11. Validate before releasing the next tranche',[
    'The 90-day target is conditional. The forecast assumes no operating trips in month one, 13 operating days in month two and 26 in month three. DPO guidance allows up to 30 working days after a complete registration application [S6], and other approvals may take longer. Do not conduct unapproved real-data operation to fit a presentation timeline.',
    'Initial discovery uses anonymous research tallies and consented observation of existing transport, not a public Mova service or personal GPS database. Do not treat research consent as a substitute for applicable registration or operational permissions.'
],[row for row in P['validation']],['Gate','Work to perform','Pass / change / stop condition'])
section('12. Questions the team must answer', [f'{q}\n{a}' for q,a in P['questions']])
section('13. Two-minute presentation script',[
    'Our project is Mova, a locally supported moto pickup service. We are starting with consenting adults around ASYV and Ntunga, not claiming a national launch. Official evidence makes last-mile access worth investigating, but we still need to prove local demand with interviews and observed pickups.',
    'The customer chooses a plate, confirms a meeting point and communicates with the driver. After an agreed lawful quote, the driver arrives, a pickup code confirms the start, and payment happens after the trip. Our current demonstration uses an animated driver; it does not prove real-world travel time.',
    'We propose an approved 8% service fee on completed app trips and RWF 75,000/month per institutional coordination desk. Both prices need willingness-to-pay tests and regulatory confirmation. We will not collect passenger deposits or charge cancelled rides.',
    'We request a conditional RWF 2.85 million 90-day envelope, releasing RWF 150,000 for research first. Month three is still RWF 84,800 short on cash operations. With two paying institutions, cash break-even needs approximately four completed app trips per driver each operating day. The pilot must show demand, repeat use, better driver economics and reliable collection before expansion.',
    'Our innovation is not simply putting bargaining on a map. It is proving whether a trusted, accountable pickup network with assisted access works better for this particular local community.'
])
section('14. Sources and evidence status',[
    f'[{s["id"]}] {s["title"]} — {s["type"]}. {s["url"]}\n{s["finding"]}' for s in P['sources']
]+['Sources checked 10 November 2026. Observations, cohort results and supplier quotes have not been fabricated. No partnership, approval or legal permission is implied by listing an organization. All forecast prices, unit volumes, conversion, collection, staff allowances and in-kind values remain editable planning assumptions.'])

md=[f'# {P["title"]}',f'{P["subtitle"]} | {P["date"]}','']
for sec in sections:
    md+=['## '+sec['title'],'']
    for p in sec['paragraphs']:md += [p,'']
    if sec['table']:
        md += ['| '+' | '.join(sec['headers'])+' |','|'+'|'.join(['---']*len(sec['headers']))+'|']
        md += ['| '+' | '.join(str(v).replace('|','/') for v in row)+' |' for row in sec['table']];md+=['']
(OUT/'Mova_Rwanda_Business_Plan.md').write_text('\n'.join(md),encoding='utf-8')

styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='MBody',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=9,textColor=colors.HexColor('#26352e')))
styles.add(ParagraphStyle(name='MCell',fontName='Helvetica',fontSize=8,leading=11,spaceAfter=3))
styles.add(ParagraphStyle(name='MHead',fontName='Helvetica-Bold',fontSize=16,leading=20,spaceBefore=18,spaceAfter=10,textColor=colors.HexColor('#2c4938'),keepWithNext=True))
def para(text,style='MBody'):
    return Paragraph(escape(str(text)).replace('\n','<br/>'),styles[style])
story=[Paragraph('MOVA',styles['Title']),para(P['subtitle']),para(P['date']),para('Research, nine-block canvas, budget, revenue model and presentation Q&A'),Spacer(1,16)]
for sec in sections:
    story.append(Paragraph(sec['title'],styles['MHead']))
    for p in sec['paragraphs']:story.append(para(p))
    if sec['table']:
        rows=[[para(v,'MCell') for v in sec['headers']]]+[[para(v,'MCell') for v in row] for row in sec['table']]
        n=len(sec['headers']);width=A4[0]-84
        if n==3: widths=[width*.25,width*.32,width*.43]
        elif n==7:widths=[width*.23]+[width*.77/6]*6
        else:widths=[width/n]*n
        t=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e9e2d3')),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#b8b5aa')),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]));story+=[t,Spacer(1,10)]
def footer(c,doc):
    c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#687267'));c.drawString(42,25,'Mova / Rwanda / planning assumptions, not validated trading results');c.drawRightString(A4[0]-42,25,str(doc.page))
SimpleDocTemplate(str(OUT/'Mova_Rwanda_Business_Plan.pdf'),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=42,bottomMargin=45,title=P['title'],author='Mova project team').build(story,onFirstPage=footer,onLaterPages=footer)
word=Document();word.add_heading('MOVA',0);word.add_paragraph(P['subtitle']);word.add_paragraph(P['date'])
word.styles['Normal'].font.name='Calibri';word.styles['Normal'].font.size=DP(11)
for sec in sections:
    word.add_heading(sec['title'],1)
    for p in sec['paragraphs']:word.add_paragraph(p)
    if sec['table']:
        table=word.add_table(rows=1, cols=len(sec['headers']));table.style='Light Shading Accent 1'
        for cell,text in zip(table.rows[0].cells,sec['headers']):cell.text=text
        for row in sec['table']:
            for cell,text in zip(table.add_row().cells,row):cell.text=str(text)
word.save(OUT/'Mova_Rwanda_Business_Plan.docx')

# ---------- Editable financial workbook; cached results are provided for viewers ----------
wb=xlsxwriter.Workbook(str(OUT/'Mova_Financial_Model.xlsx'))
head=wb.add_format({'bold':True,'font_color':'#FFFFFF','bg_color':'#304B3B','text_wrap':True,'valign':'top'})
inp=wb.add_format({'font_color':'#1F5FA6','bg_color':'#EDF4FB','num_format':'#,##0.00;[Red](#,##0.00)','text_wrap':True})
num=wb.add_format({'num_format':'#,##0;[Red](#,##0)'})
pct=wb.add_format({'font_color':'#1F5FA6','bg_color':'#EDF4FB','num_format':'0.0%'})
note=wb.add_format({'text_wrap':True,'valign':'top','font_color':'#5A645D'})
total=wb.add_format({'bold':True,'bg_color':'#E8E0D0','num_format':'#,##0;[Red](#,##0)'})
def sheet(name,headers,widths):
    ws=wb.add_worksheet(name);ws.freeze_panes(1,1);ws.set_row(0,32)
    for col,(h,w) in enumerate(zip(headers,widths)):ws.write(0,col,h,head);ws.set_column(col,col,w)
    ws.set_landscape();ws.fit_to_pages(1,0);ws.set_header('&LMOVA | Financial planning assumptions');ws.set_footer('&RPage &P');return ws
read=sheet('Read me',['Topic','Decision / definition'],[28,115])
read_rows=[['Purpose','Edit blue inputs; derived figures recalculate in Excel. All money is RWF unless marked USD. Figures are cash planning, not audited revenue or after-tax profit.'],['Evidence','National/local evidence is separate from prices, demand and fee assumptions. Read the linked Sources tab and the detailed report.'],['Pricing gate','8% commission, 75,000/desk, tariff assumptions and negotiation require regulator/operator confirmation and willingness-to-pay tests. No contracts are signed.'],['Scope','90-day conditional pilot; 20 licensed drivers, adults only, borrowed devices/space, limited human support. No fleet purchase or passenger wallet.'],['Cash vs GMV','Passenger fares go to drivers after riding. Only proposed platform fees and institutional subscriptions are Mova receipts.'],['Tax','VAT deduction input is 0 in the base, not a statement of exemption. Set 18% if inclusive platform prices become subject to standard VAT; confirm actual treatment with an accountant. Income tax is excluded.'],['Hosting/insurance','Allowances are not quotes or evidence of permission. Get data hosting/transfer authorization, permits and insurance terms before launch; pause if mandatory costs exceed the envelope.'],['API estimate','Free monthly quotas are per SKU/billing-account terms. Assumes four map loads/two routes per request and 80% completion. Geocoding/other APIs must be monitored; higher use or different SKUs can cost more.'],['FX','1,600 RWF/USD is a planning conversion only, not a quoted spot rate.'],['Founder time','Shadow founder labour is reported separately from cash; no full-time founder salaries are funded.'],['Budget total',CAP],['Rounded ask',I['funding']],['Month 3 cash result',BASE['operating']],['Base break-even trips',BE],['Read alongside','Mova_Rwanda_Business_Plan.pdf and Mova_BMC_Poster.pdf. No commercial launch is approved by this model.']]
for r,row in enumerate(read_rows,1):
    read.write(r,0,row[0],note);read.write(r,1,row[1],num if isinstance(row[1],(float,int)) else note);read.set_row(r,45 if r<10 else 30)
ins=sheet('Inputs',['Input','Value','Status / unit'],[35,20,100]);refs={}
notes={'fare':'Illustrative average only; not an ASYV–Ntunga quote','fee_rate':'Proposed fee; permission and acceptance unproven','collection':'Cash collection assumption; permits 5% leakage','planning_rwf_usd':'Planning conversion, not a spot quote','vat_deduction':'0 base. Set 0.18 only if inclusive platform prices require standard VAT deduction.','institution_fee':'Proposed coordination price; no signed buyers','completion_rate':'Assumed completed/attempted requests; not measured'}
percent_keys={'fee_rate','collection','contingency','completion_rate','vat_deduction'}
for r,(key,value) in enumerate(I.items(),1):
    ins.write(r,0,key,note);ins.write(r,1,value,pct if key in percent_keys else inp);ins.write(r,2,notes.get(key,'Editable planning assumption; replace with verified evidence/quotes'),note);refs[key]=f"Inputs!$B${r+1}";ins.set_row(r,31)
    lower=0.01 if key=='completion_rate' else 1 if key in ['drivers','days','fare'] else 0
    upper=1 if key in percent_keys else 31 if key=='days' else 100000000
    ins.data_validation(r,1,r,1,{'validate':'decimal','criteria':'between','minimum':lower,'maximum':upper,'input_title':'Planning assumption','input_message':'Replace with measured evidence or a quote.','error_title':'Invalid assumption','error_message':f'Enter a value from {lower} to {upper}.','error_type':'stop'})
def ref(k):return refs[k]
setup_ws=sheet('Setup',['Item','Cash RWF','Basis'],[61,22,80])
for r,row in enumerate(P['setup'],1):
    setup_ws.write(r,0,row[0],note);setup_ws.write(r,1,row[1],inp);setup_ws.write(r,2,row[2],note);setup_ws.set_row(r,38)
setup_ws.write(3,0,'Driver verification/onboarding',note)
setup_ws.write_formula(3,1,f'={ref("drivers")}*5000',num,100000)
setup_ws.write(3,2,'Current driver input × RWF 5,000 planning allowance',note)
setup_row=len(P['setup'])+1;setup_ws.write(setup_row,0,'Total one-off setup',head);setup_ws.write_formula(setup_row,1,f'=SUM(B2:B{setup_row})',total,SETUP)
fixed_ws=sheet('Monthly costs',['Item','RWF / month','Basis'],[61,22,80])
for r,row in enumerate(P['fixed'],1):fixed_ws.write(r,0,row[0],note);fixed_ws.write(r,1,row[1],inp);fixed_ws.write(r,2,row[2],note);fixed_ws.set_row(r,38)
dr=len(P['fixed'])+1;fixed_ws.write(dr,0,'Driver data contribution',note);fixed_ws.write_formula(dr,1,f'={ref("drivers")}*{ref("data_per_driver")}',num,I['drivers']*I['data_per_driver']);fixed_ws.write(dr,2,'Partial subsidy; scales with active driver roster',note)
fr=dr+1;fixed_ws.write(fr,0,'Pilot fixed cost + driver support',head);fixed_ws.write_formula(fr,1,f'=SUM(B2:B{fr})',total,BASE['fixed'])
FIXED=f"'Monthly costs'!$B${fr+1}";SETUP_REF=f'Setup!$B${setup_row+1}'
budget=sheet('90-day budget',['Item','RWF','Meaning'],[58,24,95])
brows=[('Setup',f'={SETUP_REF}',SETUP,'One-off, including first research release'),('Three months fixed support',f'={FIXED}*3',BASE['fixed']*3,'No fleet or office lease'),('Full-capacity variable provision',f'={ref("drivers")}*{ref("days")}*{ref("rides_per_driver_day")}*3*{ref("variable_cost")}',CAP_VARIABLE,'4,680 completed trips, deliberately above the phased forecast'),('Pre-contingency total','=SUM(B2:B4)',CAP_BEFORE,'Cash spending ceiling before reserve'),('15% contingency',f'=B5*{ref("contingency")}',CONTINGENCY,'Unspent reserve, not profit'),('Total envelope','=B5+B6',CAP,'Zero customer receipts assumed'),('Rounded funding request',f'={ref("funding")}',I['funding'],'Conditional authorization, not immediate spend'),('Unallocated rounding headroom','=B8-B7',I['funding']-CAP,'No double-counted contingency'),('First discovery release', '=150000',150000,'Part of setup, not an extra 150,000'),('Shadow founder setup time',f'={ref("setup_founder_hours")}*{ref("replacement_hour_rate")}',500000,'In kind; not cash'),('Shadow founder operating time',f'={ref("monthly_founder_hours")}*3*{ref("replacement_hour_rate")}',450000,'In kind; not cash'),('Borrowed devices value',f'={ref("borrowed_devices_value")}',200000,'Assumed borrowed; replace if unavailable'),('Shared space/power value',f'={ref("borrowed_space_total")}',150000,'Assumed in kind'),('Total in-kind resources','=SUM(B11:B14)',1300000,'Not added to cash ask')]
for r,(label,formula,value,description) in enumerate(brows,1):budget.write(r,0,label,note);budget.write_formula(r,1,formula,total if r in [4,6,7] else num,value);budget.write(r,2,description,note);budget.set_row(r,36)
cap_requests=f'ROUNDUP({ref("drivers")}*{ref("days")}*{ref("rides_per_driver_day")}/{ref("completion_rate")},0)'
cap_api=f'((MAX(0,{cap_requests}*{ref("map_loads_per_request")}+{ref("extra_map_loads")}-{ref("maps_free")})*{ref("maps_usd_per_1000")}/1000+MAX(0,{cap_requests}*{ref("routes_per_request")}-{ref("routes_free")})*{ref("routes_usd_per_1000")}/1000)*{ref("planning_rwf_usd")})'
budget.write_formula(2,1,f'=({FIXED}-\'Monthly costs\'!$B$3+MAX(\'Monthly costs\'!$B$3,ROUNDUP({cap_api},0)))*3',num,1500000)
budget.write(2,2,'Includes recalculated Maps/routing budget at the maximum monthly pilot volume',note)
cols=['Case','Drivers','Days','Trips/driver/day','Avg fare','Fee %','Collection %','Desks','Support uplift','Trips','Fare GMV','Billed service fees','Trip cash receipts','Desk cash receipts','Total cash receipts','Map loads','Route requests','API cost estimate','Maps budget','Fixed cash costs','Variable provision','Cash operating result','Founder shadow cost','After founder time']
scws=sheet('Scenarios',cols,[27]+[17]*23)
for r,s in enumerate(SC,1):
    excel=r+1
    vals=[s['name'],s['drivers'],s['days'],s['rides_per_driver_day'],s['fare'],s['fee_rate'],s['collection'],s['institutions'],s['support_extra']]
    for c,v in enumerate(vals):scws.write(r,c,v,pct if c in [5,6] else inp if c else note)
    formulas=[
      (9,f'=B{excel}*C{excel}*D{excel}',s['trips']), (10,f'=J{excel}*E{excel}',s['gmv']),
      (11,f'=K{excel}*F{excel}/(1+{ref("vat_deduction")})',s['billed']), (12,f'=L{excel}*G{excel}',s['trip_cash']),
      (13,f'=H{excel}*{ref("institution_fee")}/(1+{ref("vat_deduction")})',s['partner_cash']), (14,f'=M{excel}+N{excel}',s['cash']),
      (15,f'=ROUNDUP(J{excel}/{ref("completion_rate")},0)*{ref("map_loads_per_request")}+{ref("extra_map_loads")}',s['loads']),
      (16,f'=ROUNDUP(J{excel}/{ref("completion_rate")},0)*{ref("routes_per_request")}',s['routes']),
      (17,f'=(MAX(0,P{excel}-{ref("maps_free")})*{ref("maps_usd_per_1000")}/1000+MAX(0,Q{excel}-{ref("routes_free")})*{ref("routes_usd_per_1000")}/1000)*{ref("planning_rwf_usd")}',s['api']),
      (18,f"=MAX('Monthly costs'!$B$3,ROUNDUP(R{excel},0))",s['map_budget']),
      (19,f"=SUM('Monthly costs'!$B$2:$B$8)-'Monthly costs'!$B$3+S{excel}+B{excel}*{ref('data_per_driver')}+I{excel}",s['fixed']),
      (20,f'=J{excel}*{ref("variable_cost")}',s['variable']), (21,f'=O{excel}-T{excel}-U{excel}',s['operating']),
      (22,f'={ref("monthly_founder_hours")}*{ref("replacement_hour_rate")}',s['shadow']), (23,f'=V{excel}-W{excel}',s['economic'])]
    for c,formula,value in formulas:scws.write_formula(r,c,formula,total if c in [14,21,23] else num,value)
    scws.set_row(r,45)
scws.autofilter(0,0,3,23)
for r in range(1,4):
    for c in [5,6]:scws.data_validation(r,c,r,c,{'validate':'decimal','criteria':'between','minimum':0,'maximum':1,'error_type':'stop','error_message':'Enter a rate between 0 and 1.'})
scws.write(6,0,'All scenarios are hypotheses, pre-income-tax. Compare total fee burden and driver net earnings before adoption.',note)
unit=sheet('Unit economics',['Measure','RWF / count','Formula / caveat'],[58,24,100])
unitrows=[('Billed service fee per completed trip',f'={ref("fare")}*{ref("fee_rate")}/(1+{ref("vat_deduction")})',200,'Not the full passenger fare'),('Collected fee per completed trip',f'=B2*{ref("collection")}',190,'Allows 5% leakage in base'),('Variable provision',f'={ref("variable_cost")}',20,'Estimate, not a vendor quote'),('Contribution before fixed costs','=B3-B4',170,'Must remain positive'),('Institutional cash receipts',f'={ref("institution_count")}*{ref("institution_fee")}/(1+{ref("vat_deduction")})',150000,'Only if contracts actually pay'),('Base break-even trips',f'=IF(B5>0,ROUNDUP(MAX(0,({FIXED}-B6))/B5,0),0)',BE,'Fixed maps floor valid at base threshold; higher-volume cases require API recalculation'),('Break-even completed trips/day',f'=B7/{ref("days")}',BE/26,'Not requests; 80% completion assumption'),('Break-even per driver/day',f'=B8/{ref("drivers")}',BE/26/20,'Base operating cash only, not after-tax/full-cost profit'),('No-desk break-even lower bound',f'=IF(B5>0,ROUNDUP({FIXED}/B5,0),0)',BE_NO_PARTNER,'API overage can raise this; zero means no positive contribution / model not viable')]
for r,(label,formula,value,explain) in enumerate(unitrows,1):unit.write(r,0,label,note);unit.write_formula(r,1,formula,total if r in [4,6] else num,value);unit.write(r,2,explain,note);unit.set_row(r,40)
decimal=wb.add_format({'num_format':'0.00'})
unit.write_formula(7,1,f'=B7/{ref("days")}',decimal,BE/26)
unit.write_formula(8,1,f'=B8/{ref("drivers")}',decimal,BE/26/20)
unit.write_formula(6,1,"=IFERROR(MATCH(TRUE,INDEX('Break-even detail'!H2:H10002>=0,0),0)-1,0)",total,BE)
unit.write(6,2,'Exact volume search including map/routing overage. Zero = no break-even within 10,000 trips.',note)
unit.write(9,0,'No-desk break-even including API usage',note)
unit.write_formula(9,1,"=IFERROR(MATCH(TRUE,INDEX('Break-even detail'!I2:I10002>=0,0),0)-1,0)",num,BE_NO_PARTNER)
unit.write(9,2,'Exact search at base driver count. Zero = no break-even within 10,000 trips.',note)
be_ws=sheet('Break-even detail',['Trips','Requests','Map loads','Route requests','Maps budget RWF','Fixed cash cost','Trip contribution','With desks: result','No desks: result'],[20]*9)
for n in range(10001):
    r=n+1;e=r+1;v=calc(rides_per_driver_day=n/(I['drivers']*I['days']))
    be_ws.write_number(r,0,n,num)
    fs=[(1,f'=ROUNDUP(A{e}/{ref("completion_rate")},0)',v['requests']),
        (2,f'=B{e}*{ref("map_loads_per_request")}+{ref("extra_map_loads")}',v['loads']),
        (3,f'=B{e}*{ref("routes_per_request")}',v['routes']),
        (4,f'=MAX(\'Monthly costs\'!$B$3,ROUNDUP((MAX(0,C{e}-{ref("maps_free")})*{ref("maps_usd_per_1000")}/1000+MAX(0,D{e}-{ref("routes_free")})*{ref("routes_usd_per_1000")}/1000)*{ref("planning_rwf_usd")},0))',v['map_budget']),
        (5,f'={FIXED}-\'Monthly costs\'!$B$3+E{e}',v['fixed']),
        (6,f'=A{e}*({ref("fare")}*{ref("fee_rate")}*{ref("collection")}/(1+{ref("vat_deduction")} )-{ref("variable_cost")})',n*CONTRIB),
        (7,f'=G{e}+{ref("institution_count")}*{ref("institution_fee")}/(1+{ref("vat_deduction")})-F{e}',v['operating']),
        (8,f'=G{e}-F{e}',v['operating']-v['partner_cash'])]
    for c,formula,value in fs:be_ws.write_formula(r,c,formula,num,value)
be_ws.autofilter(0,0,10001,8)
be_ws.conditional_format('H2:I10002',{'type':'cell','criteria':'>=','value':0,'format':wb.add_format({'bg_color':'#E2F0D9'})})
run=sheet('90-day cash flow',['Month','Drivers','Operating days','Trips/driver/day','Desks','Completed trips','Cash receipts','Fixed cost','Variable','Setup','Opening cash','Closing cash'],[17]*12)
for r,(assump,res) in enumerate(zip(P['ramp'],RUN),1):
    e=r+1
    for c,v in enumerate([assump['month'],I['drivers'],assump['days'],assump['rides_per_driver_day'],assump['institutions']]):run.write(r,c,v,inp)
    for c,formula,value in [(5,f'=B{e}*C{e}*D{e}',res['trips']),(6,f'=(F{e}*{ref("fare")}*{ref("fee_rate")}*{ref("collection")}+E{e}*{ref("institution_fee")})/(1+{ref("vat_deduction")})',res['cash']),(7,f'={FIXED}',res['fixed']),(8,f'=F{e}*{ref("variable_cost")}',res['variable']),(9,f'={SETUP_REF}' if r==1 else '=0',res['setup']),(10,f'={ref("funding")}' if r==1 else f'=L{e-1}',res['opening']),(11,f'=K{e}+G{e}-H{e}-I{e}-J{e}',res['closing'])]:run.write_formula(r,c,formula,total if c==11 else num,value)
    run.write_formula(r,1,f'={ref("drivers")}',num,I['drivers'])
    attempted=f'ROUNDUP(F{e}/{ref("completion_rate")},0)'
    api_formula=f'((MAX(0,{attempted}*{ref("map_loads_per_request")}+{ref("extra_map_loads")}-{ref("maps_free")})*{ref("maps_usd_per_1000")}/1000+MAX(0,{attempted}*{ref("routes_per_request")}-{ref("routes_free")})*{ref("routes_usd_per_1000")}/1000)*{ref("planning_rwf_usd")})'
    run.write_formula(r,7,f'={FIXED}-\'Monthly costs\'!$B$3+MAX(\'Monthly costs\'!$B$3,ROUNDUP({api_formula},0))',num,res['fixed'])
run.write(6,0,'No operating trips in month one; month two has 13 operating days. Permissions may delay launch further. Fixed costs remain budgeted.',note)
run.write(8,0,'Contingency remains inside closing cash until spent. It is not an extra cost deducted twice, or operating profit.',note)
sources=sheet('Sources',['ID','Source','URL','Status / relevance'],[10,50,95,110])
for r,s in enumerate(P['sources'],1):sources.write(r,0,s['id']);sources.write(r,1,s['title'],note);sources.write_url(r,2,s['url'],string=s['url']);sources.write(r,3,s['finding'],note);sources.set_row(r,65)
wb.close()

# Check cached values, formulas, references and source links without changing the file.
fbook=load_workbook(OUT/'Mova_Financial_Model.xlsx',data_only=False)
cached=load_workbook(OUT/'Mova_Financial_Model.xlsx',data_only=True)
assert cached['90-day budget']['B7'].value==2844640
assert cached['Scenarios']['V3'].value==-84800
assert cached['Scenarios']['V4'].value==392360
assert cached['90-day cash flow']['L4'].value==1048600
for ws in fbook:
    for row in ws:
        for cell in row:
            if cell.data_type=='f':assert '#REF!' not in cell.value

# ---------- Large A3 conventional nine-block poster ----------
DARK='#14221b'; CREAM='#f5f1e8'; ORANGE='#e47542'; GREEN='#294836'; MUTED='#667362'
poster=canvas.Canvas(str(OUT/'Mova_BMC_Poster.pdf'),pagesize=landscape(A3))
W,H=landscape(A3);poster.setFillColor(colors.HexColor(CREAM));poster.rect(0,0,W,H,fill=1,stroke=0)
poster.setFillColor(colors.HexColor(DARK));poster.setFont('Helvetica-Bold',30);poster.drawString(30,H-45,'MOVA / BUSINESS MODEL CANVAS')
poster.setFont('Helvetica',12);poster.drawString(30,H-68,'ASYV–Ntunga, Rwanda | 90-day adult pilot | Planning assumptions, not validated trading results')
poster.setFillColor(colors.HexColor(GREEN));poster.setFont('Helvetica',11);poster.drawString(30,H-89,'Purpose: dependable local pickup, clear communication and lawful pricing — pay the driver after the trip.')
gap=8;left=30;usable=W-60;col=(usable-gap*4)/5;top=H-110;main_h=410;bottom_h=160
def poster_box(key,x,y,w,h):
    b=BLOCK[key];poster.setFillColor(colors.white);poster.setStrokeColor(colors.HexColor('#c0c8bb'));poster.roundRect(x,y,w,h,8,fill=1,stroke=1)
    poster.setFillColor(colors.HexColor(ORANGE));poster.rect(x+12,y+h-12,24,3,fill=1,stroke=0)
    title=Paragraph(escape(b['title']),ParagraphStyle('posterhead',fontName='Helvetica-Bold',fontSize=15,leading=19,textColor=colors.HexColor(DARK)))
    _,th=title.wrap(w-24,h);title.drawOn(poster,x+12,y+h-25-th)
    body='<br/>'.join('• '+escape(line) for line in b['short'])
    p=Paragraph(body,ParagraphStyle('posterbody',fontName='Helvetica',fontSize=11.8,leading=16,textColor=colors.HexColor('#26392c')))
    _,ph=p.wrap(w-24,h);assert ph+th+43<h,(key,ph,h);p.drawOn(poster,x+12,y+h-38-th-ph)
y=top-main_h
poster_box('partners',left,y,col,main_h);poster_box('activities',left+col+gap,y+(main_h+gap)/2,col,(main_h-gap)/2);poster_box('resources',left+col+gap,y,col,(main_h-gap)/2)
poster_box('value',left+2*(col+gap),y,col,main_h);poster_box('relationships',left+3*(col+gap),y+(main_h+gap)/2,col,(main_h-gap)/2);poster_box('channels',left+3*(col+gap),y,col,(main_h-gap)/2);poster_box('segments',left+4*(col+gap),y,col,main_h)
bottom_y=y-gap-bottom_h;poster_box('costs',left,bottom_y,(usable-gap)/2,bottom_h);poster_box('revenue',left+(usable+gap)/2,bottom_y,(usable-gap)/2,bottom_h)
poster.setFont('Helvetica',9);poster.setFillColor(colors.HexColor(MUTED));poster.drawString(30,35,'All 9 blocks follow the connected assignment/template. Evidence, quotes needed, formulas and sources are in the companion report/model.')
poster.drawString(30,20,'Proposed fees and negotiation require applicable regulatory permission. No partnership with ASYV or any institution is claimed. / 10 November 2026')
poster.save()

# ---------- Matching editable PPTX and vector PDF presentation ----------
prs=Presentation();prs.slide_width=Inches(16);prs.slide_height=Inches(9)
deckpdf=canvas.Canvas(str(OUT/'Mova_Presentation.pdf'),pagesize=(1152,648))
slide_count=0
def rgb(h):return RGBColor.from_string(h.lstrip('#'))
def slide(title,kicker='MOVA / RWANDA',note_text=''):
    global slide_count,sl
    slide_count+=1;sl=prs.slides.add_slide(prs.slide_layouts[6]);sl.background.fill.solid();sl.background.fill.fore_color.rgb=rgb(DARK)
    deckpdf.setFillColor(colors.HexColor(DARK));deckpdf.rect(0,0,1152,648,stroke=0,fill=1)
    box(.55,.45,14.9,.32,kicker,12,ORANGE,bold=True)
    box(.55,.95,14.9,1.05,title,34,CREAM,bold=True)
    box(.55,8.5,14,.23,'MOVA | Assumptions clearly labelled | '+P['date'],10,'#a9b9aa')
    box(15,8.5,.5,.23,str(slide_count),10,'#a9b9aa')
    if note_text:sl.notes_slide.notes_text_frame.text=note_text
def box(x,y,w,h,text,size=20,color=CREAM,bold=False,fill=None):
    if fill:
        shape=sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h));shape.fill.solid();shape.fill.fore_color.rgb=rgb(fill);shape.line.fill.background()
        deckpdf.setFillColor(colors.HexColor(fill));deckpdf.roundRect(x*72,648-(y+h)*72,w*72,h*72,9,fill=1,stroke=0)
    shape=sl.shapes.add_textbox(Inches(x+.04),Inches(y+.02),Inches(w-.08),Inches(h-.04))
    tf=shape.text_frame;tf.word_wrap=True;tf.margin_left=Pt(4);tf.margin_right=Pt(4);tf.margin_top=Pt(2);tf.margin_bottom=Pt(2)
    for i,line in enumerate(text.split('\n')):
        p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text=line;p.font.name='Aptos';p.font.size=Pt(size);p.font.bold=bold;p.font.color.rgb=rgb(color);p.space_after=Pt(7)
    pp=Paragraph(escape(text).replace('\n','<br/>'),ParagraphStyle('slide',fontName='Helvetica-Bold' if bold else 'Helvetica',fontSize=size,leading=size*1.22,textColor=colors.HexColor(color)))
    _,height=pp.wrap((w-.18)*72,(h-.08)*72)
    assert height <= (h-.02)*72,(slide_count,text[:70],height,h*72)
    pp.drawOn(deckpdf,(x+.09)*72,648-(y+.05)*72-height)
def end():deckpdf.showPage()

slide('Make local pickup dependable.',note_text=P['pitch'])
box(.65,2.2,9,1.4,'One corridor first.\nASYV ↔ Ntunga',34,CREAM,bold=True)
box(.65,4.2,9,2.1,'Choose the plate. Confirm the meeting point.\nCommunicate clearly. Ride first. Pay afterwards.',24)
box(10.3,2.25,4.9,1.6,'RWF 2.85m\nconditional pilot envelope',25,DARK,bold=True,fill='#efb48a')
box(10.3,4.25,4.9,2.2,'20 licensed drivers\n100 active-adult target\n90-day validation pilot',24,CREAM,fill='#294334')
box(.65,7.1,14.6,.75,'A working prototype demonstrates the process. It does not prove demand, safe operations or profit.',18,'#bed0be');end()

slide('The access problem matters. Local demand still needs proof.',note_text='Sources S1 and S2. Do not convert national household indicators into local customer counts. Collect baseline evidence before spending the rest of the budget.')
box(.65,2.3,4.5,2.05,'17% rural\n54% urban',34,ORANGE,bold=True,fill='#243b2e')
box(.65,4.6,4.5,1.55,'Households within 20 minutes of a public transport stage. [S1]',20)
box(5.65,2.3,4.5,2.05,'A real last-mile\ncorridor',29,ORANGE,bold=True,fill='#243b2e')
box(5.65,4.6,4.5,1.55,'ASYV’s directions go via Ntunga, then about 9 km off the main road. [S2]',20)
box(10.65,2.3,4.5,2.05,'What we do\nNOT know yet',29,'#efb48a',bold=True,fill='#243b2e')
box(10.65,4.6,4.5,2.1,'Local no-show rates, true pickup times, paid demand and driver willingness to pay.',20)
box(.65,7.2,14.6,.7,'Research first: 30 adult passengers, 20 drivers, 5 budget holders and 30 observed pickup attempts.',20,'#bed0be');end()

slide('Beat the customer’s current solution, not an imaginary gap.',note_text='S5 is a competitor self-description with legacy wording. Confirm current availability in Ntunga. Street hail and direct contacts may already work well; the pilot must demonstrate a better outcome.')
for x,title,body in [( .65,'Walk to the rank','Familiar, direct and no app.\nProve less search and waiting.'),(5.65,'Call a known driver','Existing trust and easy discussion.\nProve backup availability and useful records.'),(10.65,'Existing platforms','Metering, payment options and trip records already exist. [S5]\nDo not claim these are unique.')]:
    box(x,2.4,4.5,.75,title,25,ORANGE,bold=True);box(x,3.4,4.5,2.8,body,22,CREAM,fill='#243b2e')
box(.65,7.1,14.7,.8,'Proposed edge: a locally supported driver roster, honest pickup coordination and assisted access.',23,'#efb48a');end()

slide('Canvas / customers, value and access',note_text='Canvas blocks: customer segments, value proposition, customer relationships, channels. See the A3 poster for the conventional nine-block layout and report for detailed commitments.')
cards=[('WHO USES IT','Adult staff, visitors and nearby workers.\n100 active customers is a target, not an existing audience.'),('WHY THEY CHOOSE IT','Identify a plate, agree a meeting point, communicate and pay after the trip.\nProve reliability.'),('HOW WE REACH THEM','Mobile web, rank demonstrations and authorized partner desks.\nAssisted booking for non-smartphone users.'),('HOW WE RETAIN THEM','Kinyarwanda-first onboarding, familiar drivers, clear support hours and useful trip records.')]
for i,(title,body) in enumerate(cards):
    x=.65+(i%2)*7.75;y=2.15+(i//2)*2.75;box(x,y,7.1,.5,title,16,ORANGE,bold=True);box(x,y+.65,7.1,1.85,body,21,CREAM,fill='#243b2e')
end()

slide('Canvas / operations must make the promise real',note_text='Canvas blocks: key partners, activities and resources. All institutions are prospective. Exclude unaccompanied-minor transport from this first pilot. The current demo’s animated movement is not real GPS.')
for x,title,body in [(.65,'PARTNERS','Licensed local cooperative.\nProspective institutions.\nRURA / privacy advice.\nCompliant suppliers.'),(5.65,'ACTIVITIES','Verify drivers.\nCoordinate pickups.\nSupport complaints.\nMaintain secure records.\nReconcile fees weekly.'),(10.65,'RESOURCES','Existing prototype.\nBorrowed devices / space.\nFounder work in kind.\nPart-time support.\nWorking capital.')]:
    box(x,2.3,4.5,.5,title,18,ORANGE,bold=True);box(x,3.05,4.5,3.9,body,23,CREAM,fill='#243b2e')
box(.65,7.45,14.7,.5,'No motorcycle purchases. No office lease. No claim that any partner has already signed.',19,'#bed0be');end()

slide('Canvas / earn from service, control the cash cost',note_text='Revenue streams and cost structure. Every fee requires permission and evidence of willingness to pay. Passenger fare is driver GMV, not Mova revenue. There are no signed institutional buyers.')
box(.65,2.25,7,.65,'PROPOSED REVENUE',24,ORANGE,bold=True)
box(.65,3.2,7,3.3,'8% fee on completed app trips only.\nRWF 75,000/month per institutional desk.\nNo cancelled-trip fee or passenger deposit.\nGrants fund the pilot; they are not sales.',23,CREAM,fill='#243b2e')
box(8.1,2.25,7,.65,'LEAN COST MODEL',24,ORANGE,bold=True)
box(8.1,3.2,7,3.3,'RWF 880,000 setup.\nRWF 500,000/month at 20 drivers.\nRWF 20/completed trip variable provision.\nFounder labour disclosed separately.',23,CREAM,fill='#243b2e')
box(.65,7.2,14.7,.6,'Lower cost does not mean free: support, compliance, hosting and map usage are budgeted.',21,'#bed0be');end()

slide('One completed trip: where the money actually goes',note_text='All prices are illustrative. RWF 2,500 is not a verified corridor tariff. Driver retained gross excludes operating costs and other fees. 95% is collection of platform fees, not passenger completion.')
metrics=[('2,500','RWF illustrative fare\npaid to driver'),('200','RWF platform fee\nproposed at 8%'),('190','RWF collected\nat 95% collection'),('170','RWF contribution\nafter RWF 20 variable')]
for i,(value,label) in enumerate(metrics):
    x=.65+i*3.88;box(x,2.5,3.5,.9,value,42,ORANGE,bold=True);box(x,3.8,3.5,1.7,label,21)
box(.65,6.3,14.5,1.1,'With two paying desks, base cash break-even is 2,059 trips/month:\nabout 4 completed app trips per driver per operating day.',26,'#efb48a',bold=True);end()

slide('A capped experiment: RWF 2.85 million',note_text='Zero revenue is assumed in the funding cap. The first RWF 150,000 is part of setup, not added again. Additional mandatory permit/insurance costs must fit the reserve or the pilot must pause/change scope.')
labels=[('Setup',880000),('3 months fixed support',1500000),('Variable provision / 4,680 trips',93600),('15% contingency',371040)]
for i,(label,val) in enumerate(labels):box(.8,2.25+i*.95,9,.6,label,24);box(10.7,2.25+i*.95,4,.6,money(val),26,ORANGE,bold=True)
box(.8,6.55,14,.7,'Calculated envelope: RWF 2,844,640',27,'#efb48a',bold=True)
box(.8,7.45,14,.5,'Release RWF 150,000 for discovery first. No fleet purchases or nationwide launch.',19,'#bed0be');end()

slide('Be honest: the base pilot is not yet profitable.',note_text='Scenarios are assumptions. Expansion increases human support and API costs and needs more sites/ranks. All results are before setup and income tax. The detailed model also deducts founder shadow cost.')
headers=['Monthly case','Trips','Cash receipts','Cash operating result']
for i,(x,w) in enumerate([(.7,4.5),(5.3,2),(7.6,3),(11.1,4)]):box(x,2.3,w,.7,headers[i],18,ORANGE,bold=True)
for row,s in enumerate(SC):
    y=3.35+row*1.12
    for (x,w),text in zip([(.7,4.5),(5.3,2),(7.6,3),(11.1,4)],[s['name'],money(s['trips']),money(s['cash']),money(s['operating'])]):box(x,y,w,.75,text,23,'#efb48a' if s['operating']<0 else '#c4e3ba',bold=True)
box(.7,7.15,14.5,.8,'No paying desks, lower fares or unpaid driver fees can break the model. Expansion is a testable hypothesis.',21,'#bed0be');end()

slide('Rwanda-specific conditions come before launch.',note_text='Sources S3, S4, S6, S7, S11 and S12. This is operational planning, not a legal opinion. Confirm the applicable requirements with the regulator, operator and qualified adviser.')
items=[('FARES & FEES','Confirm current RURA rules. Bargaining and a new platform fee are conditional, not assumed permitted.'),('PEOPLE & DATA','Licensed operators, verified insurance and helmets; adults-only pilot. Privacy registration and lawful hosting.'),('SERVICE & TAX','Defined support hours and escalation. Confirm invoicing, VAT and income-tax treatment. No held passenger deposits.')]
for i,(title,body) in enumerate(items):
    y=2.2+i*1.72;box(.7,y,3.2,.65,title,20,ORANGE,bold=True);box(4.1,y,10.8,1.1,body,23)
end()

slide('90-day go / change / stop gates',note_text='Approvals can extend the calendar. DPO registration may take up to 30 working days after a complete application. These are targets, not measured results.')
items=[('1 / DISCOVER','30 passengers, 20 drivers, 5 budget holders; observe 30 pickups. Is this problem painful enough?'),('2 / OPERATE','Permitted, supported trial: target ≥80% completion and 30% lower median wait versus measured baseline.'),('3 / GET PAID','10 drivers accept the permitted fee; 95% collection; two institutions sign and pay.'),('4 / EARN REPEAT USE','Target 30% repeat within 30 days. Protect driver take-home income. Stop if economics or safety fail.')]
for i,(title,body) in enumerate(items):
    x=.65+(i%2)*7.75;y=2.15+(i//2)*2.7;box(x,y,7.1,.5,title,17,ORANGE,bold=True);box(x,y+.67,7.1,1.8,body,21,CREAM,fill='#243b2e')
end()

slide('The ask: prove this corridor before expanding.',note_text=P['pitch']+'\nKey Q&A: Why not WhatsApp? Is bargaining legal? Why do drivers pay? Where does the fee come from on cash trips? Are institutional contracts signed? Is founder work actually free? The detailed report answers these explicitly.')
box(.8,2.3,14.2,1.35,'Approve a conditional RWF 2.85m envelope.\nStart with RWF 150,000 for discovery.',32,'#efb48a',bold=True)
box(.8,4.3,14.2,1.8,'We will measure reliable pickup, real repeat use, driver earnings and actual cash collection.\nIf the evidence does not support the model, we change it or stop.',27)
box(.8,7.15,14.2,.7,'Demonstration: customer request → driver agreement → 15-second simulated approach → pickup code → pay after.',19,'#bed0be');end()

slide('Evidence and references',note_text='All sources are linked in the report and financial workbook. Connected assignment and template were read for structure only and were not modified.')
sources_to_show=['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12']
for i,sid in enumerate(sources_to_show):
    s=next(s for s in P['sources'] if s['id']==sid);x=.7+(i//6)*7.75;y=2.2+(i%6)*.82;box(x,y,7,.7,f'[{sid}] {s["title"]}',17,CREAM)
box(.7,7.55,14.7,.45,'Full links, source limits, canvas details, budget assumptions and 16 audience questions: companion report.',17,'#bed0be');end()
prs.save(OUT/'Mova_Presentation.pptx');deckpdf.save()

index='''# Mova presentation pack

Open **Mova_Presentation.pdf** to present immediately, or edit **Mova_Presentation.pptx** in PowerPoint. The deck has speaker notes and an honest problem / evidence / business / budget / validation story.

- **Mova_BMC_Poster.pdf** — one-page A3 landscape nine-block canvas; print as the class handout/poster.
- **Mova_Rwanda_Business_Plan.pdf** — detailed report with source links, all nine blocks, budgets, unit economics, risks, validation, Q&A and presentation script.
- **Mova_Rwanda_Business_Plan.docx** — editable version of the report.
- **Mova_Financial_Model.xlsx** — editable blue inputs, formula-backed scenarios, cash runway and source register; all amounts are RWF unless marked USD.
- **Mova_Rwanda_Business_Plan.md**, **plan.json**, **calculated_summary.json**, **build_materials.py** — editable/reproducible source material.

Core decision: a conditional **RWF 2.85 million** pilot, not a national launch or guaranteed profitable business. First release **RWF 150,000** for discovery within that envelope. Month-three base cash operating result is **minus RWF 84,800**, before income tax and founder replacement cost. Two institutional subscriptions and an approved 8% completed-trip fee remain hypotheses, not signed business.

The original connected BMC template, assignment and project report were read only and were not overwritten. Research checked 10 November 2026. No app behaviour, payment collection, external messaging or permissions were changed by this business-planning task.
'''
(OUT/'START_HERE.md').write_text(index,encoding='utf-8')
with zipfile.ZipFile(OUT/'Mova_Presentation_Pack.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['Mova_Presentation.pdf','Mova_Presentation.pptx','Mova_BMC_Poster.pdf','Mova_Rwanda_Business_Plan.pdf','Mova_Rwanda_Business_Plan.docx','Mova_Financial_Model.xlsx','START_HERE.md']:
        z.write(OUT/name,name)
print(json.dumps({'slides':slide_count,'report_sections':len(sections),'setup':SETUP,'cash_envelope':CAP,'ask':I['funding'],'month_3_cash_result':BASE['operating'],'break_even_completed_trips':BE,'files':[(p.name,p.stat().st_size) for p in OUT.iterdir() if p.suffix in ['.pdf','.pptx','.docx','.xlsx','.zip']]},indent=2))
