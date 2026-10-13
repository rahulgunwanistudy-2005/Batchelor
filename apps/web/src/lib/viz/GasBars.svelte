<script lang="ts">
 import bench from '@batchelor/core/bench.json';
 const scenarios=bench.scenarios.filter(row=>row.name.startsWith('clear'));
 const largest=Math.max(...scenarios.map(row=>row.monadNine));
 const orderRows=bench.scenarios.filter(row=>row.name.startsWith('orders'));
 const maxGas=Math.max(...orderRows.map(row=>row.monadNine));
 const format=(value:number)=>value.toLocaleString('en-US');
</script>
<div class="legend"><span>MonadNine · before MIP-8</span><span>MonadTen · after MIP-8</span></div>
<svg viewBox={`0 0 800 ${scenarios.length*72}`} role="img" aria-labelledby="gas-title gas-desc"><title id="gas-title">Measured clearing gas before and after MIP-8</title><desc id="gas-desc">Paired bars for each benchmark; exact gas values and ratios appear below.</desc>
{#each scenarios as row,i}<text x="0" y={i*72+30}>{row.activeTicks*2} ticks</text><rect class="before" x="100" y={i*72+8} width={row.monadNine/largest*570} height="18" rx="3"/><rect class="after" x="100" y={i*72+32} width={row.monadTen/largest*570} height="18" rx="3"/><text x="690" y={i*72+30}>{row.ratio.toFixed(2)}×</text>{/each}
</svg>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard focus allows scrolling of exact benchmark values.) -->
<div class="table-scroll" tabindex="0" role="region" aria-label="Exact clearing gas measurements"><table><caption>Active ticks across both sides. Internal clearing gas excludes telemetry, event and transaction overhead.</caption><thead><tr><th scope="col">Ticks</th><th scope="col">MonadNine</th><th scope="col">MonadTen</th><th scope="col">Ratio</th></tr></thead><tbody>{#each scenarios as row}<tr><th scope="row">{row.activeTicks*2}</th><td>{format(row.monadNine)}</td><td>{format(row.monadTen)}</td><td>{row.ratio.toFixed(2)}×</td></tr>{/each}</tbody></table></div>
<h3>Clearing work stays constant as orders increase</h3><p>{bench.measurement.orderCount}.</p>
<svg viewBox="0 0 800 210" role="img" aria-labelledby="orders-title orders-desc"><title id="orders-title">Clearing gas versus order count</title><desc id="orders-desc">{orderRows.map(row=>`${row.orders} orders: ${row.monadTen} gas under MonadTen and ${row.monadNine} under MonadNine`).join('. ')}. The book and volume stay fixed.</desc>
{#each ['monadNine','monadTen'] as fork}<polyline class:before={fork==='monadNine'} class:after={fork==='monadTen'} fill="none" stroke-width="3" points={orderRows.map((r,i)=>`${110+i*290},${170-r[fork as 'monadNine'|'monadTen']/maxGas*140}`).join(' ')}/>{/each}
{#each orderRows as row,i}<text x={90+i*290} y="202">{row.orders} orders</text><circle class="before" cx={110+i*290} cy={170-row.monadNine/maxGas*140} r="5"/><circle class="after" cx={110+i*290} cy={170-row.monadTen/maxGas*140} r="5"/>{/each}
</svg>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard focus enables scrolling of the order-count measurements.) -->
<div class="table-scroll" tabindex="0" role="region" aria-label="Clearing gas by order count"><table><thead><tr><th scope="col">Orders</th><th scope="col">MonadNine</th><th scope="col">MonadTen</th></tr></thead><tbody>{#each orderRows as row}<tr><th scope="row">{row.orders}</th><td>{format(row.monadNine)}</td><td>{format(row.monadTen)}</td></tr>{/each}</tbody></table></div>
<style>.legend{display:flex;gap:24px;flex-wrap:wrap;font-size:14px;margin:24px 0}.legend span:first-child{color:var(--muted)}.legend span:last-child{color:var(--clear)}svg{display:block;width:100%;margin:20px 0}text{fill:var(--ink);font:14px 'IBM Plex Sans',sans-serif}.before{fill:var(--muted);stroke:var(--muted)}.after{fill:var(--clear);stroke:var(--clear)}rect,circle{stroke:none}.table-scroll{overflow-x:auto;margin:24px 0}.table-scroll:focus-visible{outline:3px solid var(--clear)}table{width:100%;border-collapse:collapse;font-size:14px}caption{color:var(--muted);text-align:left;margin-bottom:12px}th,td{text-align:right;padding:12px;border-bottom:1px solid var(--line);white-space:nowrap}th:first-child{text-align:left}h3{margin-top:32px}</style>
