import { ArrowRight, Check, CheckCheck, ChevronRight, Clock3, Mic, Phone, ShieldCheck, VerifiedBadge } from '../icons'
import { VoiceOrb } from './VoiceOrb'
import { BrandMark } from './BrandMark'

const steps = [
  { number: '01', title: 'Tell Sarah', body: 'Speak naturally. Sarah turns the conversation into a precise, reviewable brief.', icon: Mic },
  { number: '02', title: 'Sarah calls around', body: 'She checks supply and calls only ABN-verified, authorised suppliers.', icon: Phone },
  { number: '03', title: 'You decide', body: 'Compare the evidence, approve the best fit, and keep control of every order.', icon: CheckCheck },
]

export function LandingPage({onStart}:{onStart:()=>void}) {
  return <div className="landing" id="top">
    <div className="landing-glow landing-glow-one" aria-hidden="true"/>
    <div className="landing-glow landing-glow-two" aria-hidden="true"/>

    <header className="landing-nav">
      <a className="landing-brand" href="#top" aria-label="SourcePilot home">
        <BrandMark className="landing-mark"/>
        <span>sourcepilot</span><i>.</i>
      </a>
      <nav aria-label="Primary navigation">
        <a href="#how">How it works</a>
        <a href="#control">Built for trust</a>
      </nav>
      <button className="landing-cta" onClick={onStart}>Enter workspace <ArrowRight size={15}/></button>
    </header>

    <main>
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-status"><span/> Voice procurement, ready when you are</div>
          <h1>Your next supplier<br/>is a <em>conversation</em> away.</h1>
          <p>Tell Sarah what your business needs. Your SourcePilot AI checks supply, calls verified suppliers, and returns with the best options—ready for your approval.</p>
          <div className="landing-hero-actions">
            <button className="landing-primary" onClick={onStart}><Mic size={17}/> Start with your voice <ArrowRight size={16}/></button>
            <a className="landing-ghost" href="#how">See the 60-second flow <ChevronRight size={15}/></a>
          </div>
          <div className="landing-proof">
            <span><ShieldCheck size={14}/> ABN verified</span>
            <span><Clock3 size={14}/> Business-hours only</span>
            <span><Check size={14}/> Nothing bought without you</span>
          </div>
        </div>

        <div className="landing-agent-stage" aria-label="A preview of Sarah, the SourcePilot voice agent">
          <div className="landing-stage-topline">
            <span><i/> SARAH · SOURCEPILOT AI</span>
            <span>LIVE WORKFLOW</span>
          </div>
          <div className="landing-agent-core">
            <button className="landing-orb-button" onClick={onStart} aria-label="Start a request">
              <span className="landing-orb-halo"/>
              <VoiceOrb/>
            </button>
            <div className="landing-agent-copy">
              <span>READY TO LISTEN</span>
              <strong>What do you need?</strong>
              <small>Tap the orb to start</small>
            </div>
          </div>
          <div className="landing-request-card">
            <div className="landing-request-head">
              <span>REQUEST / 001</span>
              <span className="landing-processing"><i/> PROCESSING</span>
            </div>
            <p>“I need 30 kilos of chicken breast by 8 am tomorrow, under $350.”</p>
            <div className="landing-tags"><span>30 KG</span><span>BEFORE 08:00</span><span>≤ $350</span></div>
          </div>
          <div className="landing-stage-footer">
            <span><VerifiedBadge size={13}/> Brief structured</span>
            <span>3 suppliers ready to call</span>
          </div>
        </div>
      </section>

      <section className="landing-signal" aria-label="Product assurances">
        <span>Built for Australian operators</span><div/><span>Verified suppliers</span><div/><span>Traceable quote evidence</span><div/><span>Owner approval by design</span>
      </section>

      <section id="how" className="landing-section landing-how">
        <div className="landing-section-head">
          <span className="landing-kicker">ONE REQUEST. THREE CLEAR STEPS.</span>
          <h2>From “we’re running low”<br/>to a decision you can trust.</h2>
          <p>No tabs, spreadsheets, or phone tag. SourcePilot keeps the work moving and keeps you in the loop.</p>
        </div>
        <div className="landing-steps">
          {steps.map(({number,title,body,icon:Icon}) => <article key={number}>
            <div className="landing-step-icon"><Icon size={19}/></div>
            <span className="landing-step-number">/{number}</span>
            <h3>{title}</h3><p>{body}</p><span className="landing-step-line"/>
          </article>)}
        </div>
      </section>

      <section id="control" className="landing-section landing-control">
        <div className="landing-control-copy">
          <span className="landing-kicker">CONTROL, BUILT IN</span>
          <h2>An agent that knows<br/>where its job ends.</h2>
          <p>SourcePilot handles the legwork. You set the rules and make the final call. Every supplier, quote, and conversation remains visible.</p>
          <button className="landing-text-cta" onClick={onStart}>Explore the demo workspace <ArrowRight size={16}/></button>
        </div>
        <div className="landing-approval-card">
          <div className="landing-approval-top"><span>RECOMMENDED SUPPLIER</span><span><ShieldCheck size={13}/> VERIFIED BY CALL</span></div>
          <div className="landing-supplier">
            <div className="landing-supplier-logo">VF</div>
            <div><strong>Victorian Foods</strong><span>Exact match · 30 kg available</span></div>
            <div className="landing-price">$315<small>AUD · DELIVERED</small></div>
          </div>
          <div className="landing-terms"><span><Check size={13}/> In budget</span><span><Check size={13}/> On time</span><span><Check size={13}/> Net 14</span></div>
          <div className="landing-approval-bottom">
            <span><strong>$35 under budget.</strong><small>All requirements met.</small></span>
            <button onClick={onStart}>Review & approve <ArrowRight size={15}/></button>
          </div>
        </div>
      </section>

      <section className="landing-final">
        <div className="landing-final-orb"><VoiceOrb/></div>
        <span className="landing-kicker">SARAH IS READY</span>
        <h2>Tell us what you need.<br/><em>We’ll take it from here.</em></h2>
        <button className="landing-primary" onClick={onStart}><Mic size={17}/> Start a request <ArrowRight size={16}/></button>
        <p>Explore with sample data. No sign-up required.</p>
      </section>
    </main>

    <footer className="landing-footer">
      <span className="landing-brand"><BrandMark className="landing-mark"/><span>sourcepilot</span><i>.</i></span>
      <span>Voice procurement for Australian business.</span>
      <span>© 2026 SourcePilot · AUD</span>
    </footer>
  </div>
}
