import type {CSSProperties, ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const C = {
  navy: '#071c50',
  navy2: '#0c2b68',
  blue: '#164cc8',
  bright: '#3979e8',
  ink: '#172b4d',
  muted: '#6b7891',
  line: '#dfe7f4',
  wash: '#f4f7fd',
  green: '#138a5b',
  greenWash: '#eaf8f1',
  red: '#bd3c52',
  redWash: '#fff1f3',
};

const font = 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const Icon = ({children, size = 24, style}: {children: ReactNode; size?: number; style?: CSSProperties}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={style}>
    {children}
  </svg>
);

const Phone = ({size}: {size?: number}) => <Icon size={size}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92Z"/></Icon>;
const Check = ({size}: {size?: number}) => <Icon size={size}><path d="m5 12 4 4L19 6"/></Icon>;
const Shield = ({size}: {size?: number}) => <Icon size={size}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></Icon>;
const Truck = ({size}: {size?: number}) => <Icon size={size}><path d="M10 17h4V5H2v12h3"/><path d="M14 9h4l4 4v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></Icon>;
const Spark = ({size}: {size?: number}) => <Icon size={size}><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z"/></Icon>;

const enter = (frame: number, start: number, fps: number, distance = 20) => {
  const p = spring({frame: frame - start, fps, config: {damping: 18, stiffness: 150, mass: 0.7}});
  return {opacity: p, transform: `translateY(${(1 - p) * distance}px)`};
};

const TypeLine = ({text, frame, start, duration = 110}: {text: string; frame: number; start: number; duration?: number}) => {
  const count = Math.floor(interpolate(frame, [start, start + duration], [0, text.length], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  return <>{text.slice(0, count)}{frame >= start && frame < start + duration ? <span style={{color: C.bright}}>▋</span> : null}</>;
};

type Turn = {speaker: 'SourcePilot' | 'Supplier'; text: string; start: number; duration: number};

const turns: Turn[] = [
  {speaker: 'SourcePilot', start: 55, duration: 205, text: 'Hello, I’m calling on behalf of Michelle’s Restaurant. We require 40 kilograms of chicken thighs delivered by Friday. Could you confirm availability and your best price?'},
  {speaker: 'Supplier', start: 290, duration: 125, text: 'We have the stock available at $7 per kilogram, with a 30 per cent deposit.'},
  {speaker: 'SourcePilot', start: 440, duration: 210, text: 'That would total $280 and exceed our approved budget. Michelle’s Restaurant expects to reorder weekly. Could you offer $6.50 per kilogram and reduce the deposit to 10 per cent?'},
  {speaker: 'Supplier', start: 680, duration: 120, text: 'We can agree to $6.50 per kilogram with a 10 per cent deposit.'},
  {speaker: 'SourcePilot', start: 825, duration: 125, text: 'Thank you. Please confirm the full quantity can be delivered by Friday.'},
  {speaker: 'Supplier', start: 975, duration: 65, text: 'Yes, it can.'},
];

const Waveform = ({frame, active}: {frame: number; active: boolean}) => (
  <div style={{height: 48, display: 'flex', alignItems: 'center', gap: 7}}>
    {Array.from({length: 28}, (_, i) => {
      const base = 7 + (Math.sin(i * 1.7) + 1) * 6;
      const moving = active ? 18 + Math.abs(Math.sin(frame * 0.18 + i * 0.72)) * 24 : base;
      return <div key={i} style={{width: 4, height: moving, borderRadius: 10, background: i > 20 ? '#8fb3f2' : C.bright, opacity: active ? 0.9 : 0.48}}/>;
    })}
  </div>
);

const Pill = ({children, tone = 'blue'}: {children: ReactNode; tone?: 'blue' | 'green' | 'red' | 'neutral'}) => {
  const palette = tone === 'green' ? [C.greenWash, C.green] : tone === 'red' ? [C.redWash, C.red] : tone === 'neutral' ? ['#eef2f7', C.muted] : ['#eaf1ff', C.blue];
  return <span style={{display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 999, background: palette[0], color: palette[1], fontSize: 15, fontWeight: 650}}>{children}</span>;
};

const QuoteCard = ({frame, fps}: {frame: number; fps: number}) => {
  const hasQuote = frame >= 290;
  const countering = frame >= 440;
  const accepted = frame >= 680;
  const confirmed = frame >= 975;
  const quoteEnter = enter(frame, 290, fps, 16);
  const acceptedPulse = spring({frame: frame - 680, fps, config: {damping: 12, stiffness: 170}});
  if (!hasQuote) return <div style={{padding: '29px 28px', border: `1px dashed #cbd8eb`, borderRadius: 18, color: '#7e8ca4', fontSize: 16}}>Waiting for supplier quote…</div>;
  return (
    <div style={{...quoteEnter, border: `1px solid ${accepted ? '#bde6d2' : countering ? '#f2cfd5' : C.line}`, borderRadius: 18, background: accepted ? '#fbfffd' : '#fff', boxShadow: '0 12px 30px rgba(7,28,80,.06)', overflow: 'hidden'}}>
      <div style={{padding: '22px 24px 18px', borderBottom: `1px solid ${accepted ? '#d9eee4' : '#e9eef6'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div>
          <div style={{fontSize: 13, letterSpacing: 1.5, color: C.muted, fontWeight: 700}}>LIVE QUOTE</div>
          <div style={{fontSize: 20, fontWeight: 720, color: C.ink, marginTop: 7}}>FreshFoods Wholesale</div>
        </div>
        <Pill tone={accepted ? 'green' : countering ? 'red' : 'blue'}>{accepted ? <><Check size={17}/> Agreed</> : countering ? 'Countering' : 'Received'}</Pill>
      </div>
      <div style={{padding: 24}}>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13}}>
          <div style={{padding: 16, borderRadius: 13, background: accepted ? C.greenWash : C.wash}}>
            <div style={{fontSize: 13, color: C.muted}}>Unit price</div>
            <div style={{fontSize: 31, fontWeight: 760, letterSpacing: -1.2, color: accepted ? C.green : C.ink, marginTop: 6}}>
              {accepted ? '$6.50' : '$7.00'} <span style={{fontSize: 14, fontWeight: 550}}>/ kg</span>
            </div>
          </div>
          <div style={{padding: 16, borderRadius: 13, background: accepted ? C.greenWash : countering ? C.redWash : C.wash}}>
            <div style={{fontSize: 13, color: C.muted}}>Deposit</div>
            <div style={{fontSize: 31, fontWeight: 760, color: accepted ? C.green : countering ? C.red : C.ink, marginTop: 6}}>{accepted ? '10%' : '30%'}</div>
          </div>
        </div>
        <div style={{marginTop: 14, padding: '16px 17px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 13, background: accepted ? '#f0faf5' : countering ? C.redWash : C.wash}}>
          <span style={{fontSize: 15, color: C.muted}}>40 kg total</span>
          <strong style={{fontSize: 27, color: accepted ? C.green : countering ? C.red : C.ink}}>{accepted ? '$260' : '$280'}</strong>
        </div>
        {countering && !accepted ? <div style={{marginTop: 13, fontSize: 14, lineHeight: 1.45, color: C.red, fontWeight: 620}}>Above the approved $260 budget · proposing revised terms</div> : null}
        {accepted ? <div style={{opacity: acceptedPulse, transform: `scale(${0.96 + acceptedPulse * 0.04})`, marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, color: C.green, fontSize: 15, fontWeight: 680}}><Shield size={19}/>{confirmed ? 'Quantity and Friday delivery confirmed' : 'Price and deposit within policy'}</div> : null}
      </div>
    </div>
  );
};

const TranscriptTurn = ({turn, frame, fps}: {turn: Turn; frame: number; fps: number}) => {
  if (frame < turn.start) return null;
  const agent = turn.speaker === 'SourcePilot';
  return (
    <div style={{...enter(frame, turn.start, fps, 24), display: 'grid', gridTemplateColumns: '48px 1fr', gap: 15, marginBottom: 18}}>
      <div style={{width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: agent ? '#eaf1ff' : '#eef1f5', color: agent ? C.blue : '#56647b', fontWeight: 800, fontSize: 14}}>{agent ? <Img src={staticFile('favicon.svg')} style={{width: 31, height: 31}}/> : 'FF'}</div>
      <div style={{padding: '17px 20px 18px', borderRadius: agent ? '6px 18px 18px 18px' : '18px 6px 18px 18px', background: agent ? '#f0f5ff' : '#f4f5f7', border: `1px solid ${agent ? '#dbe7fb' : '#e1e5eb'}`}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7}}>
          <strong style={{fontSize: 14, color: agent ? C.blue : '#46536a'}}>{turn.speaker}</strong>
          <span style={{fontSize: 12, color: '#98a3b5'}}>Live</span>
        </div>
        <div style={{fontSize: 19, lineHeight: 1.48, color: C.ink, letterSpacing: -0.15}}><TypeLine text={turn.text} frame={frame} start={turn.start + 8} duration={turn.duration}/></div>
      </div>
    </div>
  );
};

const formatCallTime = (frame: number, fps: number) => {
  const seconds = Math.max(0, Math.floor((frame - 45) / fps));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const SupplierNegotiation = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const connected = frame >= 45;
  const complete = frame >= 1040;
  const scroll = interpolate(frame, [0, 430, 660, 805, 950, 1040], [0, 0, -120, -315, -495, -600], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const finish = spring({frame: frame - 1040, fps, config: {damping: 16, stiffness: 120}});
  const pulse = 1 + Math.sin(frame * 0.12) * 0.05;

  return (
    <AbsoluteFill style={{fontFamily: font, color: C.ink, background: '#f8faff', display: 'flex', flexDirection: 'column'}}>
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 82% 18%, rgba(57,121,232,.13), transparent 31%), radial-gradient(circle at 8% 94%, rgba(22,76,200,.08), transparent 29%)'}}/>
      <header style={{height: 96, padding: '0 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'relative', zIndex: 2}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 15}}>
          <Img src={staticFile('favicon.svg')} style={{width: 47, height: 47}}/>
          <div style={{fontSize: 29, fontWeight: 790, color: C.navy, letterSpacing: -1.1}}>SourcePilot</div>
          <div style={{height: 27, width: 1, background: '#d9e2f0', margin: '0 4px'}}/>
          <span style={{fontSize: 16, color: C.muted}}>Supplier negotiation</span>
        </div>
        <div style={{display: 'flex', gap: 18, alignItems: 'center'}}>
          <Pill tone="neutral"><Shield size={17}/> Guardrails active</Pill>
          <span style={{fontVariantNumeric: 'tabular-nums', color: C.muted, fontSize: 15}}>Request MR-1042</span>
        </div>
      </header>

      <main style={{position: 'relative', zIndex: 1, flex: 1, padding: '44px 62px 52px', display: 'grid', gridTemplateColumns: '515px 1fr', gap: 34, minHeight: 0}}>
        <aside style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          <section style={{background: C.navy, color: '#fff', padding: 28, borderRadius: 22, boxShadow: '0 22px 45px rgba(7,28,80,.18)', minHeight: 253}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
              <div>
                <div style={{fontSize: 13, fontWeight: 700, letterSpacing: 1.6, color: '#9cb5e3'}}>OUTBOUND CALL</div>
                <h2 style={{fontSize: 28, margin: '10px 0 6px', letterSpacing: -0.8}}>FreshFoods Wholesale</h2>
                <div style={{color: '#b7c7e6', fontSize: 15}}>Melbourne, VIC · Authorised supplier</div>
              </div>
              <div style={{width: 57, height: 57, display: 'grid', placeItems: 'center', borderRadius: 18, background: connected ? '#159767' : '#1e4387', transform: connected ? `scale(${pulse})` : 'none'}}><Phone size={25}/></div>
            </div>
            <div style={{marginTop: 27, paddingTop: 22, borderTop: '1px solid #24417a', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
              <div>
                <div style={{display: 'flex', alignItems: 'center', gap: 9, color: connected ? '#79e2b7' : '#b9cbeb', fontWeight: 700, fontSize: 16}}>
                  <span style={{width: 9, height: 9, borderRadius: 99, background: connected ? '#3dd598' : '#9eb3d8', boxShadow: connected ? '0 0 0 6px rgba(61,213,152,.12)' : undefined}}/>
                  {connected ? 'Connected' : 'Calling FreshFoods…'}
                </div>
                <div style={{fontSize: 13, color: '#8fa8d4', marginTop: 7}}>AI disclosure complete</div>
              </div>
              <strong style={{fontSize: 25, fontVariantNumeric: 'tabular-nums', letterSpacing: 1}}>{formatCallTime(frame, fps)}</strong>
            </div>
            <Waveform frame={frame} active={connected && !complete}/>
          </section>

          <section style={{padding: '22px 24px', borderRadius: 18, background: '#fff', border: `1px solid ${C.line}`}}>
            <div style={{fontSize: 13, fontWeight: 750, letterSpacing: 1.4, color: C.muted}}>REQUEST</div>
            <div style={{fontSize: 24, fontWeight: 720, letterSpacing: -0.5, margin: '11px 0 17px'}}>40 kg · chicken thighs</div>
            <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
              <Pill><Truck size={17}/> Delivery Friday</Pill>
              <Pill tone="neutral">Budget $260</Pill>
              <Pill tone="neutral">Max deposit 10%</Pill>
            </div>
          </section>

          <QuoteCard frame={frame} fps={fps}/>
        </aside>

        <section style={{position: 'relative', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: '0 15px 40px rgba(7,28,80,.07)', overflow: 'hidden'}}>
          <div style={{height: 92, padding: '0 31px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.line}`, background: 'rgba(255,255,255,.96)', position: 'relative', zIndex: 3}}>
            <div>
              <div style={{fontSize: 13, letterSpacing: 1.5, color: C.muted, fontWeight: 740}}>LIVE TRANSCRIPT</div>
              <div style={{fontSize: 17, color: C.ink, marginTop: 8}}>Negotiating price and payment terms</div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 9, color: C.green, fontSize: 14, fontWeight: 680}}><span style={{width: 8, height: 8, borderRadius: 99, background: C.green}}/> Recording transcript</div>
          </div>
          <div style={{position: 'absolute', inset: '92px 0 0', overflow: 'hidden', padding: '28px 31px'}}>
            <div style={{transform: `translateY(${scroll}px)`}}>
              {turns.map(turn => <TranscriptTurn key={turn.start} turn={turn} frame={frame} fps={fps}/>)}
            </div>
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, pointerEvents: 'none', background: 'linear-gradient(transparent, rgba(255,255,255,.98))'}}/>
          {complete ? <div style={{position: 'absolute', inset: '92px 0 0', zIndex: 5, display: 'grid', placeItems: 'center', background: `rgba(248,251,255,${finish * 0.96})`, opacity: finish}}>
            <div style={{width: 810, padding: '42px 46px', borderRadius: 26, border: '1px solid #b9e3ce', background: '#fff', boxShadow: '0 28px 70px rgba(7,28,80,.13)', transform: `translateY(${(1 - finish) * 28}px) scale(${0.96 + finish * 0.04})`}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 19}}>
                <div style={{width: 65, height: 65, display: 'grid', placeItems: 'center', borderRadius: 99, color: '#fff', background: C.green, boxShadow: '0 10px 25px rgba(19,138,91,.24)'}}><Check size={34}/></div>
                <div>
                  <div style={{fontSize: 13, letterSpacing: 1.5, color: C.green, fontWeight: 780}}>NEGOTIATION COMPLETE</div>
                  <div style={{fontSize: 32, fontWeight: 780, color: C.ink, marginTop: 7, letterSpacing: -0.8}}>Terms confirmed with FreshFoods</div>
                </div>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 31}}>
                {[['Quantity', '40 kg'], ['Unit price', '$6.50'], ['Total', '$260'], ['Deposit', '10%']].map(([label, value]) => <div key={label} style={{padding: '17px 18px', borderRadius: 14, background: C.greenWash}}><div style={{fontSize: 13, color: '#4c7b68'}}>{label}</div><strong style={{display: 'block', color: C.green, fontSize: 24, marginTop: 7}}>{value}</strong></div>)}
              </div>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 22, borderTop: '1px solid #e1eee8'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 10, color: '#39775f', fontSize: 16, fontWeight: 650}}><Truck size={21}/> Full quantity arriving Friday</div>
                <Pill tone="green"><Spark size={17}/> $20 saved</Pill>
              </div>
            </div>
          </div> : null}
        </section>
      </main>
    </AbsoluteFill>
  );
};
