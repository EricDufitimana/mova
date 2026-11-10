import { test, expect } from '@playwright/test';
// Run against a separate build with a non-secret test key; no paid API is called.
test('Google map and Routes-library integration share a driving path', async ({browser}) => {
  test.skip(!process.env.MOVA_GOOGLE_TEST, 'Requires the isolated Google fixture build.');
  const riderContext=await browser.newContext(), driverContext=await browser.newContext();
  for (const context of [riderContext,driverContext]) await context.addInitScript(()=>{
    const maps={};
    maps.Map=class {constructor(element){element.dataset.googleMap='ready';this.zoom=17;}fitBounds(){}getZoom(){return this.zoom;}setZoom(value){this.zoom=value;} };
    maps.Marker=class {constructor(options){this.options=options;window.__markerConstructions=(window.__markerConstructions || 0)+1;}addListener(){}setMap(){}setPosition(position){this.options.position=position;window.__positionUpdates=(window.__positionUpdates || 0)+1;}setIcon(icon){this.options.icon=icon;} };
    maps.Polyline=class {constructor(options){window.__lastPolyline=options.path;}setMap(){} };
    maps.LatLngBounds=class {extend(){return this;}};
    maps.SymbolPath={CIRCLE:0};
    maps.importLibrary=async name=>name === 'routes' ? {Route:{computeRoutes:async request=>{
      window.__routeRequest=request;
      return {routes:[{path:[request.origin,{lat:-1.991,lng:30.365},request.destination],distanceMeters:11000,durationMillis:1200000}]};
    }}} : maps;
    window.google={maps};
  });
  const customer=await riderContext.newPage(),driver=await driverContext.newPage();
  const errors=[];for(const page of [customer,driver])page.on('pageerror',e=>errors.push(e.message));
  await driver.goto('/#driver');await driver.getByRole('button',{name:'Go online with this plate',exact:true}).click();
  await customer.goto('/');await expect(customer.locator('[data-google-map=ready]')).toBeVisible();
  await customer.getByRole('button',{name:'Book this ride',exact:true}).click();await customer.getByLabel('Destination',{exact:true}).fill('Ntunga');await customer.getByRole('button',{name:'Send request · nothing to pay',exact:true}).click();
  await expect.poll(()=>driver.evaluate(()=>window.__routeRequest?.origin?.lng)).toBeCloseTo(30.354718);
  await driver.getByRole('button',{name:'Accept 900 RWF',exact:true}).click();await driver.getByRole('button',{name:'I’m on the way',exact:true}).click();
  await expect(customer.locator('.approach-panel .geo-map-caption')).toContainText('Google driving route');
  const ride=await customer.evaluate(async()=>{const token=localStorage.getItem('mova-rider-session');return (await(await fetch('/api/state',{headers:{Authorization:`Bearer ${token}`}})).json()).rides[0];});
  expect(ride.tracking.source).toBe('google');expect(ride.tracking.path).toHaveLength(3);expect(ride.tracking.path[2].lat).toBeCloseTo(-2.03307);
  const count=await driver.evaluate(()=>window.__markerConstructions);
  await expect.poll(()=>driver.evaluate(()=>window.__positionUpdates || 0)).toBeGreaterThan(2);
  expect(await driver.evaluate(()=>window.__markerConstructions)).toBe(count);
  expect(errors).toEqual([]);await riderContext.close();await driverContext.close();
});
