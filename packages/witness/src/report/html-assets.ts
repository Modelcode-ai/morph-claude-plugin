/** lens-www's tokens (zinc surfaces, Geist, #069bfa focus), dark only like lens-www itself. */
export const CSS = `
:root{color-scheme:dark;--bg:oklch(18.5% .006 285.9deg);--bg-deep:oklch(14.1% .005 285.8deg);--panel:oklch(22.5% .006 286deg);--panel-hi:oklch(26.9% .006 286deg);--line:oklch(33% .012 285.8deg);--line-soft:oklch(28% .009 286deg);--fg:oklch(96.7% .001 286.4deg);--sub:oklch(70.5% .015 286.1deg);--mute:oklch(55.2% .016 285.9deg);--blue:#069bfa;--blue-soft:oklch(34% .09 245deg);--ok:oklch(72.3% .219 149.6deg);--ok-mid:oklch(72.3% .219 149.6deg / .45);--ok-dim:oklch(72.3% .219 149.6deg / .3);--ok-soft:oklch(31% .08 151deg);--warn:oklch(82.8% .189 84.4deg);--warn-dim:oklch(82.8% .189 84.4deg / .45);--warn-soft:oklch(33% .07 82deg);--bad:oklch(63.7% .237 25.3deg);--bad-mid:oklch(63.7% .237 25.3deg / .55);--bad-soft:oklch(31% .09 25deg);--sans:'Geist',-apple-system,'Segoe UI',Arial,sans-serif;--mono:'Geist Mono',ui-monospace,'SFMono-Regular',Menlo,monospace;--r:8px}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
h1,h2,h3,p{margin:0}h1,h2,h3{font-weight:600;letter-spacing:-.015em;text-wrap:balance}a{color:var(--blue)}:focus-visible{outline:2px solid var(--blue);outline-offset:2px;border-radius:4px}
.mono{font-family:var(--mono);font-size:.86em}.cap{font-size:12.5px;color:var(--mute)}
@media (prefers-reduced-motion:no-preference){.rise{animation:rise 420ms cubic-bezier(.2,.7,.2,1) both}.rise.d1{animation-delay:60ms}.rise.d2{animation-delay:120ms}.rise.d3{animation-delay:180ms}@keyframes rise{from{opacity:0;transform:translateY(6px)}}}
.wrap{max-width:1040px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.top{border-bottom:1px solid var(--line-soft);background:var(--bg-deep)}.top .wrap{display:flex;align-items:center;gap:12px;padding-block:12px;flex-wrap:wrap;font-size:13.5px}
.brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px}.brand em{font-style:normal;color:var(--mute);font-weight:400}
.crumb{color:var(--sub);display:flex;gap:6px;align-items:center;flex-wrap:wrap}.crumb b{color:var(--fg);font-weight:500}.top .grow{flex:1}.runid{font-family:var(--mono);font-size:12px;color:var(--mute)}
main.wrap{padding-block:32px 80px;display:flex;flex-direction:column;gap:40px}
.hero{--tone:var(--ok);--tone-soft:var(--ok-soft);position:relative;border:1px solid var(--line);border-radius:14px;background:radial-gradient(120% 140% at 0% 0%,color-mix(in oklch,var(--tone) 16%,transparent),transparent 55%),var(--panel);padding:28px;display:flex;flex-direction:column;gap:24px;overflow:hidden}
.hero.tone-bad{--tone:var(--bad);--tone-soft:var(--bad-soft)}.hero.tone-warn{--tone:var(--warn);--tone-soft:var(--warn-soft)}.hero.tone-dim{--tone:var(--sub);--tone-soft:var(--panel-hi)}
.hero-head{display:flex;gap:18px;align-items:flex-start}.seal{width:56px;height:56px;border-radius:16px;background:var(--tone);color:var(--bg-deep);display:grid;place-items:center;flex:none;box-shadow:0 0 0 6px var(--tone-soft)}
.hero-title{display:flex;flex-direction:column;gap:6px;min-width:0}.hero-title .k{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--tone);font-weight:600}.hero-title h1{font-size:clamp(22px,3.2vw,30px);line-height:1.2;overflow-wrap:anywhere}.hero-title p{color:var(--sub);font-size:13.5px}
.diag{display:flex;flex-direction:column;gap:4px;border:1px solid var(--tone);background:var(--tone-soft);border-radius:var(--r);padding:12px 14px;font-size:13px}.diag b{font-weight:600;text-transform:capitalize}.diag span{color:var(--fg);font-family:var(--mono);font-size:12px;overflow-wrap:anywhere}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.card{background:var(--bg-deep);border:1px solid var(--line-soft);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0;text-decoration:none;color:inherit;transition:border-color 150ms}.card:hover{border-color:var(--line)}.card.muted .big{color:var(--mute)}
.card-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.card .k{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub)}.card .go{font-size:12px;color:var(--mute)}
.card .big{font-size:28px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1}.card .big.bad{color:var(--bad)}.card .big small{font-size:14px;font-weight:400;color:var(--sub);margin-left:4px}.card .cap{color:var(--sub);overflow-wrap:anywhere}
.dots{display:flex;gap:6px}.dots i{flex:1;height:10px;border-radius:3px;background:var(--line)}.dots i.ok{background:var(--ok)}.dots i.kept{background:var(--ok-mid)}.dots i.bad{background:var(--bad)}
.stack{display:flex;height:10px;border-radius:3px;overflow:hidden;gap:2px}.stack i{display:block;height:100%}
@media (max-width:760px){.cards{grid-template-columns:minmax(0,1fr)}}
.strength{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 18px;align-items:center;border-top:1px solid var(--line-soft);padding-top:20px}
.strength .lbl{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub)}.strength .lbl b{display:block;font-size:22px;letter-spacing:0;text-transform:none;color:var(--fg);font-weight:600;margin-top:2px}
.sig{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.sig div{display:flex;flex-direction:column;gap:6px;min-width:0}.sig i{height:6px;border-radius:3px;display:block}.sig span{font-size:12px;color:var(--sub);line-height:1.3}
.sig .y i{background:var(--ok)}.sig .p i{background:var(--warn)}.sig .n i{background:var(--line)}.sig .n span{color:var(--mute)}
@media (max-width:640px){.strength{grid-template-columns:minmax(0,1fr)}.sig{grid-template-columns:repeat(2,minmax(0,1fr))}}
.next{display:flex;flex-direction:column;gap:10px}.next-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}.next-h h2{font-size:16px}.next-h span{font-size:12.5px;color:var(--mute)}
.step{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:14px;align-items:center;background:var(--panel);border:1px solid var(--line-soft);border-radius:var(--r);padding:12px 14px}
.step .ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center}.step.ok .ic{background:var(--ok-soft);color:var(--ok)}.step.fix{border-color:var(--bad-mid)}.step.fix .ic{background:var(--bad-soft);color:var(--bad)}.step.do .ic{background:var(--blue-soft);color:var(--blue)}.step.low .ic{background:var(--panel-hi);color:var(--sub)}
.step b{font-weight:500;display:block}.step p{font-size:13px;color:var(--sub);overflow-wrap:anywhere}
.copy{background:transparent;border:1px solid var(--line);color:var(--fg);border-radius:6px;padding:6px 10px;font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}.copy:hover{background:var(--panel-hi)}.copy.done{color:var(--ok);border-color:var(--ok)}
@media (max-width:640px){.step{grid-template-columns:28px minmax(0,1fr)}.step .copy{grid-column:2;justify-self:start}}
.chapters{display:flex;flex-direction:column}.ch{display:grid;grid-template-columns:40px minmax(0,1fr);gap:18px;position:relative;padding-bottom:40px}
.ch::before{content:"";position:absolute;left:19px;top:40px;bottom:0;width:2px;background:linear-gradient(var(--line),var(--line-soft))}.ch:last-child::before{display:none}
.num{width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--panel);display:grid;place-items:center;font-family:var(--mono);font-size:13px;color:var(--sub)}
.ch-body{display:flex;flex-direction:column;gap:14px;min-width:0;padding-top:6px}.ch-kicker{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
.ch-take{font-size:20px;font-weight:600;line-height:1.3;letter-spacing:-.01em;max-width:48ch}.hl.ok{color:var(--ok)}.hl.bad{color:var(--bad)}.hl.warn{color:var(--warn)}
.viz{background:var(--panel);border:1px solid var(--line-soft);border-radius:12px;padding:18px;min-width:0}.viz.empty{border-style:dashed;background:transparent}.viz.empty p{color:var(--sub);font-size:14px}
.more{border:1px solid var(--line-soft);border-radius:var(--r);background:var(--bg-deep)}
.more>summary,.mini>summary{cursor:pointer;list-style:none;padding:10px 14px;font-size:13px;color:var(--sub);display:flex;align-items:center;gap:8px}
.more>summary::-webkit-details-marker,.mini>summary::-webkit-details-marker,.deep>summary::-webkit-details-marker{display:none}
.more>summary::before,.mini>summary::before{content:"›";display:inline-block;transition:transform 150ms;color:var(--mute);font-size:16px;line-height:1}.more[open]>summary::before,.mini[open]>summary::before{transform:rotate(90deg)}.more>summary:hover{color:var(--fg)}
.mini>summary{padding:4px 0}.more-body{padding:4px 14px 16px;display:flex;flex-direction:column;gap:12px}
@media (max-width:560px){.ch{grid-template-columns:minmax(0,1fr)}.ch::before,.num{display:none}}
.matrix{display:grid;grid-template-columns:minmax(0,1fr) repeat(2,96px);font-size:13.5px}.matrix.two{grid-template-columns:minmax(0,1fr) 96px}
.matrix .h{font-size:11.5px;color:var(--mute);text-transform:uppercase;letter-spacing:.07em;padding:0 0 10px;text-align:center}.matrix .h:first-child{text-align:left}
.matrix .r{padding:11px 0;border-top:1px solid var(--line-soft);display:flex;align-items:center;min-width:0}.matrix .r.c{justify-content:center}
.beh{display:flex;gap:10px;align-items:baseline;min-width:0}.beh .id{font-family:var(--mono);font-size:12px;color:var(--mute);flex:none;min-width:22px}.beh .t{min-width:0;overflow-wrap:anywhere}
.beh .kd{font-size:11px;color:var(--blue);border:1px solid oklch(65% .15 245deg / .5);border-radius:4px;padding:0 5px;margin-left:6px;white-space:nowrap}
.mk{min-width:24px;height:24px;border-radius:7px;display:inline-grid;place-items:center;font-size:13px;font-weight:600}.mk.y{background:var(--ok);color:var(--bg-deep)}.mk.x{background:var(--bad);color:var(--bg-deep)}
.mk.new{background:var(--blue-soft);color:var(--blue);padding:0 7px;font-size:11.5px}.mk.same{background:var(--ok-mid);color:var(--bg-deep)}.mk.na{color:var(--mute);font-size:12px;font-weight:400}
@media (max-width:640px){.matrix{grid-template-columns:minmax(0,1fr) repeat(2,64px);font-size:13px}.matrix.two{grid-template-columns:minmax(0,1fr) 64px}.matrix .h{font-size:10px}}
.ev-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.ev{background:var(--panel);border:1px solid var(--line-soft);border-radius:6px;padding:12px;display:flex;flex-direction:column;gap:6px;min-width:0;font-size:13px}
.ev .k{font-size:11.5px;color:var(--mute);text-transform:uppercase;letter-spacing:.07em}.ev pre{margin:0;font-family:var(--mono);font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.ev .body{white-space:pre-line;color:var(--fg)}.ev.todo{border-style:dashed;background:transparent}.ev.todo p{color:var(--sub)}
.ev-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.ev-sides{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.ev-sides.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.obs{border-top:1px solid var(--line-soft);padding:7px 0;display:flex;flex-direction:column;gap:6px;min-width:0}.obs:first-of-type{border-top:none}
.obs>summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline}.obs>summary::-webkit-details-marker{display:none}
.obs>summary::before{content:"›";color:var(--mute);transition:transform 150ms;display:inline-block}.obs[open]>summary::before{transform:rotate(90deg)}
div.obs{flex-direction:row;flex-wrap:wrap;gap:4px 8px;align-items:baseline}
.obs-kind{font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--blue);border:1px solid oklch(65% .15 245deg / .45);border-radius:4px;padding:0 5px}
.obs-title{font-family:var(--mono);font-size:12px;overflow-wrap:anywhere;min-width:0}.obs-step{font-size:12px;color:var(--sub)}
.obs-body{display:flex;flex-direction:column;gap:8px;padding:6px 0 4px 14px}.obs-part{display:flex;flex-direction:column;gap:3px}
.obs-part pre{background:var(--bg-deep);border:1px solid var(--line-soft);border-radius:6px;padding:8px 10px;max-height:260px;overflow:auto}.obs-part pre.hdr{color:var(--sub)}.obs-part pre.hit{border-color:var(--ok)}mark{background:var(--ok-soft);color:var(--ok);border-radius:3px;padding:0 2px}
.media{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.shot .media .thumb{max-width:100%}.thumb{max-width:220px;max-height:150px;border-radius:6px;border:1px solid var(--line);object-fit:cover;object-position:top;display:block}video.thumb{max-width:320px;max-height:200px}
.file-link{font-size:12px}
.ev-item{display:flex;flex-direction:column;gap:8px}.ev-item h3{font-size:13.5px;font-weight:500}.ev-item h3 span{font-family:var(--mono);color:var(--mute);font-weight:400;margin-right:6px}
.tref{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline;min-width:0}.tref .mono{overflow-wrap:anywhere;min-width:0}.tref .msg{flex-basis:100%;font-family:var(--mono);font-size:11.5px;color:var(--sub);overflow-wrap:anywhere}
.st-passed{color:var(--ok)}.st-failed,.st-other,.st-none{color:var(--bad)}.st-skipped{color:var(--warn)}.newb{color:var(--blue);font-weight:500}
.files{display:flex;flex-direction:column;gap:5px}.file{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;font-size:12.5px}
.file .tag{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;border-radius:4px;padding:0 6px;border:1px solid var(--line);color:var(--sub)}.file .tag.test{color:var(--blue);border-color:var(--blue)}
.file .p{font-family:var(--mono);font-size:12px;overflow-wrap:anywhere}.file .n{font-family:var(--mono);font-size:11.5px;white-space:nowrap}.file .a{color:var(--ok)}.file .d{color:var(--bad)}
.commits{display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:var(--sub)}
@media (max-width:760px){.ev-grid,.ev-grid.two,.ev-sides.two{grid-template-columns:minmax(0,1fr)}}
.waffle-wrap{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:22px;align-items:center}
.waffle{display:grid;grid-template-columns:repeat(auto-fill,minmax(11px,1fr));gap:3px}.waffle i{aspect-ratio:1;border-radius:2px;background:var(--ok-dim);display:block}
.waffle i.new{background:var(--blue);box-shadow:0 0 0 2px var(--blue-soft)}.waffle i.skip{background:var(--warn-dim)}.waffle i.diff{background:var(--bad)}.waffle i.fail{background:var(--bad-mid)}.waffle i.only{background:var(--line)}
.waffle.dense{grid-template-columns:repeat(auto-fill,minmax(6px,1fr));gap:2px}
.wf-legend{display:flex;flex-direction:column;gap:12px}.wf-legend div{display:grid;grid-template-columns:12px auto minmax(0,1fr);gap:10px;align-items:baseline}
.wf-legend i{width:12px;height:12px;border-radius:3px;display:block;transform:translateY(1px)}.wf-legend b{font-size:20px;font-variant-numeric:tabular-nums}.wf-legend span{font-size:12.5px;color:var(--sub)}
@media (max-width:760px){.waffle-wrap{grid-template-columns:minmax(0,1fr)}.wf-legend{flex-direction:row;flex-wrap:wrap;gap:14px 22px}}
.lanes{display:flex;flex-direction:column;gap:10px}.lane{display:grid;grid-template-columns:200px 1fr 230px;align-items:center}
.lane .src,.lane .dst{border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0}
.lane .src{background:var(--bg-deep)}.lane .src b{font-family:var(--mono);font-size:13px;font-weight:500;overflow-wrap:anywhere}.lane .src span,.lane .dst span{font-size:12px;color:var(--sub)}.lane .dst b{font-size:13px;font-weight:500}
.wire{position:relative;height:34px;display:flex;align-items:center;justify-content:center;min-width:60px}
.wire::before{content:"";position:absolute;left:0;right:8px;top:50%;height:2px;background:var(--line)}
.wire::after{content:"";position:absolute;right:0;top:calc(50% - 5px);border-left:8px solid var(--line);border-top:5px solid transparent;border-bottom:5px solid transparent}
.wire span{position:relative;background:var(--panel);padding:0 8px;font-size:12px;color:var(--sub);white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
.lane.live .wire::before{background:var(--ok)}.lane.live .wire::after{border-left-color:var(--ok)}.lane.live .dst{border-color:var(--ok);background:var(--ok-soft)}
.lane.bad .src{border-color:var(--bad)}.lane.ghost .src,.lane.ghost .dst{border-style:dashed;background:transparent}.lane.ghost b{color:var(--mute)}
.lane.ghost .wire::before{background:repeating-linear-gradient(90deg,var(--line) 0 6px,transparent 6px 10px)}
.split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
.chip-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px;background:var(--bg-deep);border:1px solid var(--line-soft);border-radius:8px;padding:10px 12px;font-size:13px}.chip-row b{font-size:17px;font-variant-numeric:tabular-nums}.chip-row span{color:var(--sub)}
@media (max-width:760px){.lane{grid-template-columns:minmax(0,1fr)}.wire{height:24px}.wire::before{left:50%;right:auto;top:0;bottom:6px;width:2px;height:auto}.wire::after{right:auto;left:calc(50% - 5px);top:auto;bottom:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid var(--line);border-bottom:none}.lane.live .wire::after{border-left-color:transparent;border-top-color:var(--ok)}.wire span{display:none}.split{grid-template-columns:minmax(0,1fr)}}
.tl{display:flex;flex-direction:column;gap:8px;overflow-x:auto}.tl-row{display:grid;grid-template-columns:84px minmax(460px,1fr);gap:10px;align-items:center}.tl-row>span{font-size:12px;color:var(--sub)}
.track{position:relative;height:22px;background:var(--panel);border-radius:4px}
.seg{position:absolute;top:3px;bottom:3px;border-radius:3px;font-size:10.5px;font-weight:600;color:var(--bg-deep);padding:0 6px;display:flex;align-items:center;overflow:hidden;white-space:nowrap;background:var(--ok)}
.seg.boot{background:var(--sub)}.seg.build{background:var(--mute)}.seg.base.suite{background:var(--ok-mid)}.seg.bad{background:var(--bad)}
.axis{position:relative;height:14px;font-family:var(--mono);font-size:10.5px;color:var(--mute)}.axis span{position:absolute;transform:translateX(-50%)}.axis span:last-child{transform:translateX(-100%)}.axis span:first-child{transform:none}
.deep{border:1px solid var(--line-soft);border-radius:12px;background:var(--panel)}.deep>summary{cursor:pointer;list-style:none;padding:16px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.deep>summary h2{font-size:16px}.deep>summary span{color:var(--mute);font-size:13px}.deep>summary .chev{margin-left:auto;color:var(--mute);transition:transform 150ms}.deep[open]>summary .chev{transform:rotate(180deg)}
.deep-body{border-top:1px solid var(--line-soft);padding:18px;display:flex;flex-direction:column;gap:18px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.filters input{background:var(--bg-deep);border:1px solid var(--line);color:var(--fg);border-radius:6px;padding:7px 10px;font:inherit;font-size:13px;flex:1 1 220px;min-width:0}
.seg-btn{display:inline-flex;flex-wrap:wrap;border:1px solid var(--line);border-radius:6px;overflow:hidden}.seg-btn button{background:transparent;color:var(--sub);border:none;padding:6px 10px;font:inherit;font-size:12.5px;cursor:pointer}.seg-btn button+button{border-left:1px solid var(--line)}.seg-btn button[aria-pressed="true"]{background:var(--panel-hi);color:var(--fg)}
.tbl{overflow:auto;max-height:440px;border:1px solid var(--line-soft);border-radius:6px}table{border-collapse:collapse;width:100%;font-size:12.5px}
th{position:sticky;top:0;background:var(--panel-hi);text-align:left;font-weight:500;color:var(--sub);font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:8px 10px}
td{padding:6px 10px;border-top:1px solid var(--line-soft);vertical-align:top}td.m{font-family:var(--mono);font-size:12px;overflow-wrap:anywhere}td.m span{color:var(--mute)}td.m .msg{color:var(--bad)}td.n{text-align:right;font-variant-numeric:tabular-nums;color:var(--sub);white-space:nowrap}
.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.facts dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:5px 10px;margin:0;font-size:12.5px}.facts dt{color:var(--mute)}.facts dd{margin:0;font-family:var(--mono);font-size:12px;overflow-wrap:anywhere}
@media (max-width:760px){.facts{grid-template-columns:minmax(0,1fr)}}
.foot{color:var(--mute);font-size:12.5px;display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:space-between}
`;

/** Waffle, test table filters and copy buttons; reads TESTS and HAS_BASE. */
export const SCRIPT = `
(function(){
var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
var w=document.getElementById("waffle");
if(w){if(TESTS.length>600)w.classList.add("dense");w.innerHTML=TESTS.map(function(t){var c=t[5]==="target_only"?"new":t[5]==="differs"?"diff":t[5]==="origin_only"?"only":t[3]==="skipped"?"skip":(t[3]==="failed"||t[3]==="other")?"fail":"";return '<i class="'+c+'" title="'+esc(t[0]+" · "+t[1])+'"></i>'}).join("")}
var rows=document.getElementById("rows"),count=document.getElementById("count"),st={q:"",suite:"",s:""};
var base={same:"same",target_only:"new",differs:"differs",origin_only:"base only"};
function render(){var q=st.q.toLowerCase();var list=TESTS.filter(function(t){if(st.suite&&t[0]!==st.suite)return false;if(st.s==="failing"&&t[3]!=="failed"&&t[3]!=="other")return false;if(st.s==="skipped"&&t[3]!=="skipped")return false;if(st.s==="new"&&t[5]!=="target_only")return false;if(st.s==="differs"&&t[5]!=="differs")return false;return !q||(t[1]+" "+t[2]).toLowerCase().indexOf(q)>=0});
var shown=list.slice(0,1000);rows.innerHTML=shown.map(function(t){return "<tr><td>"+esc(t[0])+'</td><td class="m">'+esc(t[1])+"<br><span>"+esc(t[2])+"</span>"+(t[6]?'<br><span class="msg">'+esc(t[6])+"</span>":"")+'</td><td class="st-'+esc(t[3])+'">'+esc(t[3])+"</td>"+(HAS_BASE?"<td>"+(t[5]==="target_only"?'<span class="newb">new</span>':esc(base[t[5]]||""))+"</td>":"")+'<td class="n">'+t[4]+"</td></tr>"}).join("")||'<tr><td colspan="5" class="cap">No tests match.</td></tr>';
count.textContent=list.length+" of "+TESTS.length+(list.length>1000?" (first 1000 shown)":"")}
document.getElementById("q").addEventListener("input",function(e){st.q=e.target.value;render()});
[["f-suite","suite"],["f-st","s"]].forEach(function(p){var el=document.getElementById(p[0]);el.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;Array.prototype.forEach.call(el.children,function(x){x.setAttribute("aria-pressed",String(x===b))});st[p[1]]=b.dataset.v;render()})});
render();
document.querySelectorAll(".copy").forEach(function(b){b.addEventListener("click",function(){var text=b.dataset.copy;var done=function(){b.textContent="Copied";b.classList.add("done");setTimeout(function(){b.textContent="Copy step";b.classList.remove("done")},1600)};
var fallback=function(){var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");done()}catch(e){b.textContent="Select and copy"}ta.remove()};
if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,fallback);else fallback()})});
})();
`;
