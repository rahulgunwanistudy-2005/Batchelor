/** Optional visual audit using an existing Playwright installation; no project dependency. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.env.PLAYWRIGHT_MODULE)throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright module. Start receipts:test-local with LOCAL_WEB_HOLD_SECONDS=300 first.');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const fixture=JSON.parse(await readFile(`${root}.tools/s7-browser.json`,'utf8'));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const checks=[];
try{
 for(const theme of ['light','dark'])for(const width of [375,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [name,path] of [['receipt',`/b/1?trader=${fixture.asha}`],['proof','/proof']]){
   const response=await page.goto(fixture.origin+path);if(response?.status()!==200)throw new Error('Page unavailable');
   await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
   if(overflow)throw new Error(`${name} ${width}px outer overflow`);
   if(name==='receipt'){
    if(await page.getByRole('row').filter({hasText:'Pete (bot)'}).count()!==4)throw new Error('Pete lanes missing');
    if(await page.getByRole('row').filter({hasText:'(you)'}).count()!==1)throw new Error('Viewer lane missing');
    if(!await page.locator('tr.viewer').count())throw new Error('Viewer highlight missing');
    await page.getByRole('button',{name:'Share receipt'}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('[role=status]')?.textContent));
   }
   let accessibility=null;
   if(process.env.AXE_MODULE){
    await page.addScriptTag({path:process.env.AXE_MODULE});
    const audit=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    if(audit.violations.length)throw new Error(JSON.stringify(audit.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))));
    accessibility={engine:'axe-core',violations:0,passes:audit.passes.length};
   }
   const screenshot=`docs/screens/s7-${name}-${theme}-${width}.png`;
   await page.screenshot({path:root+screenshot,fullPage:true});
   checks.push({page:name,theme,width,overflow:false,accessibility,screenshot});
  }
  if(errors.length)throw new Error(errors.join('\n'));
  await context.close();
 }
 await mkdir(`${root}docs/verification`,{recursive:true});
 await writeFile(`${root}docs/verification/s7-browser.json`,JSON.stringify({passed:true,environment:'Local real-chain Envio receipt fixture; headless Chromium, reduced motion',checks},null,2)+'\n');
 console.log(`Visual audit passed: ${checks.length} receipt/proof screenshots, no outer overflow or browser errors.`);
}finally{await browser.close();}
