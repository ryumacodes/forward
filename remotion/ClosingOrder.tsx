import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const C = {navy: '#071c50', blue: '#164cc8', bright: '#3979e8', ink: '#172b4d', muted: '#6b7891', line: '#dfe7f4', wash: '#f4f7fd', green: '#138a5b', greenWash: '#eaf8f1', amber: '#b7791f'};
const font = 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const Icon = ({children, size = 24, style}: {children: ReactNode; size?: number; style?: CSSProperties}) => <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={style}>{children}</svg>;
const Check = ({size}: {size?: number}) => <Icon size={size}><path d="m5 12 4 4L19 6"/></Icon>;
const Shield = ({size}: {size?: number}) => <Icon size={size}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></Icon>;
const File = ({size}: {size?: number}) => <Icon size={size}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></Icon>;
const Bell = ({size}: {size?: number}) => <Icon size={size}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></Icon>;
const Card = ({size}: {size?: number}) => <Icon size={size}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></Icon>;

const rise = (frame: number, start: number, fps: number, distance = 24) => {
  const p = spring({frame: frame - start, fps, config: {damping: 18, stiffness: 145, mass: 0.75}});
  return {opacity: p, transform: `translateY(${(1 - p) * distance}px)`};
};

const Badge = ({children, green = false}: {children: ReactNode; green?: boolean}) => <span style={{display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 999, background: green ? C.greenWash : '#edf2f8', color: green ? C.green : C.muted, fontSize: 14, fontWeight: 680}}>{children}</span>;

const Condition = ({label, value, frame, start, fps}: {label: string; value: string; frame: number; start: number; fps: number}) => {
  const passed = frame >= start;
  const p = spring({frame: frame - start, fps, config: {damping: 14, stiffness: 190}});
  return <div style={{height: 76, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 15, borderRadius: 14, border: `1px solid ${passed ? '#bfe4d1' : C.line}`, background: passed ? C.greenWash : '#fafbfd'}}>
    <div style={{width: 35, height: 35, flex: '0 0 35px', display: 'grid', placeItems: 'center', borderRadius: 99, color: passed ? '#fff' : '#a1adbe', background: passed ? C.green : '#eef2f7', transform: `scale(${passed ? 0.8 + p * 0.2 : 1})`}}>{passed ? <Check size={21}/> : <span style={{width: 7, height: 7, borderRadius: 99, background: '#aab5c5'}}/>}</div>
    <div style={{minWidth: 0}}><div style={{fontSize: 14, color: passed ? '#39775f' : C.muted}}>{label}</div><strong style={{display: 'block', marginTop: 4, fontSize: 17, color: passed ? C.green : C.ink}}>{value}</strong></div>
    <span style={{marginLeft: 'auto', fontSize: 13, fontWeight: 720, color: passed ? C.green : '#9ba6b7'}}>{passed ? 'PASS' : 'CHECKING'}</span>
  </div>;
};

const OrderSummary = ({frame, fps}: {frame: number; fps: number}) => {
  const sent = frame >= 185;
  const sending = frame >= 120 && !sent;
  const progress = interpolate(frame, [120, 185], [0, 100], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  return <section style={{background: '#fff', border: `1px solid ${sent ? '#b9e2cc' : C.line}`, borderRadius: 22, overflow: 'hidden', boxShadow: '0 18px 46px rgba(7,28,80,.08)'}}>
    <div style={{padding: '28px 30px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.line}`}}>
      <div><div style={{fontSize: 13, letterSpacing: 1.5, fontWeight: 760, color: C.muted}}>PURCHASE ORDER</div><h2 style={{fontSize: 28, margin: '9px 0 0', letterSpacing: -0.7}}>PO-SP-1042</h2></div>
      <Badge green={sent}>{sent ? <><Check size={17}/> Sent</> : sending ? 'Sending…' : 'Ready to send'}</Badge>
    </div>
    <div style={{padding: '27px 30px'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
        <div style={{width: 58, height: 58, display: 'grid', placeItems: 'center', borderRadius: 16, background: '#eaf1ff', color: C.blue, fontWeight: 820, fontSize: 17}}>FF</div>
        <div><strong style={{fontSize: 22}}>FreshFoods Wholesale</strong><div style={{fontSize: 14, color: C.muted, marginTop: 6}}>Michelle’s Restaurant · Request MR-1042</div></div>
        <strong style={{marginLeft: 'auto', fontSize: 37, letterSpacing: -1.5, color: C.navy}}>$260</strong>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr', gap: 12, marginTop: 27}}>
        {[['Order', '40 kg chicken thighs'], ['Delivery', 'Friday'], ['Payment', '10% deposit']].map(([label, value]) => <div key={label} style={{padding: '18px 17px', borderRadius: 14, background: C.wash}}><span style={{fontSize: 13, color: C.muted}}>{label}</span><strong style={{display: 'block', marginTop: 7, fontSize: 17}}>{value}</strong></div>)}
      </div>
      <div style={{height: 61, marginTop: 25, borderRadius: 13, overflow: 'hidden', position: 'relative', background: sent ? C.green : C.navy, color: '#fff', display: 'grid', placeItems: 'center'}}>
        {sending ? <div style={{position: 'absolute', inset: 0, width: `${progress}%`, background: C.blue}}/> : null}
        <div style={{position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 730}}>{sent ? <><Check size={21}/> Purchase order sent</> : sending ? <><File size={20}/> Securely sending purchase order…</> : <><Shield size={20}/> Pre-authorisation verified</>}</div>
      </div>
    </div>
  </section>;
};

export const ClosingOrder = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const allPassed = frame >= 104;
  const sent = frame >= 185;
  const notify = frame >= 250;
  const paymentNote = frame >= 330;
  const sentPop = spring({frame: frame - 185, fps, config: {damping: 13, stiffness: 150}});

  return <AbsoluteFill style={{fontFamily: font, color: C.ink, background: '#f8faff', display: 'flex', flexDirection: 'column'}}>
    <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 83% 10%, rgba(57,121,232,.14), transparent 30%), radial-gradient(circle at 5% 95%, rgba(22,76,200,.08), transparent 28%)'}}/>
    <header style={{height: 96, flex: '0 0 96px', padding: '0 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'relative', zIndex: 3}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 15}}><Img src={staticFile('favicon.svg')} style={{width: 47, height: 47}}/><div style={{fontSize: 29, fontWeight: 790, color: C.navy, letterSpacing: -1.1}}>SourcePilot</div><div style={{height: 27, width: 1, background: '#d9e2f0', margin: '0 4px'}}/><span style={{fontSize: 16, color: C.muted}}>Closing the order</span></div>
      <div style={{display: 'flex', alignItems: 'center', gap: 16}}><Badge green={allPassed}><Shield size={17}/> {allPassed ? 'Pre-authorised' : 'Validating rules'}</Badge><span style={{fontSize: 15, color: C.muted}}>Request MR-1042</span></div>
    </header>

    <main style={{position: 'relative', zIndex: 1, flex: 1, minHeight: 0, padding: '44px 62px 52px', display: 'grid', gridTemplateColumns: '565px 1fr', gap: 34}}>
      <section style={{padding: 29, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: '0 14px 38px rgba(7,28,80,.06)'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24}}><div><div style={{fontSize: 13, letterSpacing: 1.5, fontWeight: 760, color: C.muted}}>PRE-AUTHORISATION</div><h2 style={{fontSize: 27, margin: '9px 0 0', letterSpacing: -0.6}}>Every condition must pass</h2></div><div style={{width: 50, height: 50, borderRadius: 16, background: allPassed ? C.greenWash : '#edf2f8', color: allPassed ? C.green : C.muted, display: 'grid', placeItems: 'center'}}><Shield size={26}/></div></div>
        <div style={{display: 'grid', gap: 10}}>
          <Condition label="Exact product" value="Chicken thighs" frame={frame} start={12} fps={fps}/>
          <Condition label="Full quantity" value="40 kilograms" frame={frame} start={31} fps={fps}/>
          <Condition label="Approved total" value="$260 · within budget" frame={frame} start={50} fps={fps}/>
          <Condition label="Delivery deadline" value="Confirmed for Friday" frame={frame} start={69} fps={fps}/>
          <Condition label="Deposit limit" value="10% · within policy" frame={frame} start={88} fps={fps}/>
        </div>
        <div style={{marginTop: 19, padding: '17px 18px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 14, background: allPassed ? C.greenWash : C.wash, color: allPassed ? C.green : C.muted, fontSize: 15, fontWeight: 690}}>{allPassed ? <Check size={21}/> : <Shield size={21}/>} {allPassed ? 'All purchase rules passed' : 'Checking owner-controlled limits…'}</div>
      </section>

      <div style={{display: 'flex', flexDirection: 'column', gap: 19}}>
        <OrderSummary frame={frame} fps={fps}/>
        {sent ? <div style={{...rise(frame, 185, fps), borderRadius: 19, padding: '23px 25px', border: '1px solid #bce3cf', background: C.greenWash, display: 'flex', alignItems: 'center', gap: 17, transform: `${rise(frame, 185, fps).transform} scale(${0.98 + sentPop * 0.02})`}}>
          <div style={{width: 49, height: 49, borderRadius: 99, background: C.green, color: '#fff', display: 'grid', placeItems: 'center'}}><Check size={27}/></div>
          <div><strong style={{fontSize: 20, color: '#116b49'}}>Purchase order sent</strong><div style={{fontSize: 14, color: '#39775f', marginTop: 5}}>One order issued to FreshFoods Wholesale · $260 total</div></div>
        </div> : null}
        {notify ? <div style={{...rise(frame, 250, fps), borderRadius: 19, padding: '23px 25px', border: `1px solid ${C.line}`, background: '#fff', display: 'flex', gap: 17, alignItems: 'center'}}>
          <div style={{width: 49, height: 49, flex: '0 0 49px', borderRadius: 15, background: '#eaf1ff', color: C.blue, display: 'grid', placeItems: 'center'}}><Bell size={24}/></div>
          <div style={{flex: 1}}><div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><strong style={{fontSize: 19}}>Michelle notified</strong><Badge green><Check size={16}/> Delivered</Badge></div><div style={{fontSize: 14, lineHeight: 1.55, color: C.muted, marginTop: 6}}>FreshFoods · 40 kg · Friday delivery · 10% deposit ($26), $234 remaining</div></div>
        </div> : null}
        {paymentNote ? <div style={{...rise(frame, 330, fps), borderRadius: 19, padding: '23px 25px', background: C.navy, color: '#fff', display: 'flex', alignItems: 'center', gap: 18}}>
          <div style={{width: 49, height: 49, flex: '0 0 49px', display: 'grid', placeItems: 'center', borderRadius: 15, background: '#163b7a', color: '#b9cff4'}}><Card size={25}/></div>
          <div><strong style={{fontSize: 18}}>No payment initiated</strong><div style={{fontSize: 14, lineHeight: 1.5, color: '#b7c7e6', marginTop: 5}}>SourcePilot sends the purchase order. Michelle remains responsible for completing payment.</div></div>
        </div> : null}
      </div>
    </main>
  </AbsoluteFill>;
};
