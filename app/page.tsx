'use client';

import { CSSProperties, useEffect, useRef, useState } from 'react';
import { getStoryState, rangeProgress } from './story/progress';

const YEARS = ['0年', '5年', '10年', '20年', '30年', '40年', '50年'];
const SPRITES = ['0%', '20%', '40%', '60%', '80%', '100%'];

function useStoryProgress(stageRef: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  const target = useRef(0);
  const smooth = useRef(0);
  useEffect(() => {
    let frame = 0, top = 0, distance = 1;
    const measure = () => { const el = stageRef.current; if (!el) return; top = el.getBoundingClientRect().top + window.scrollY; distance = Math.max(1, el.offsetHeight - innerHeight); };
    const scroll = () => { target.current = Math.min(1, Math.max(0, (scrollY - top) / distance)); };
    const tick = () => { smooth.current += (target.current - smooth.current) * .095; if (Math.abs(target.current - smooth.current) < .0001) smooth.current = target.current; setProgress(smooth.current); frame = requestAnimationFrame(tick); };
    measure(); scroll(); frame = requestAnimationFrame(tick);
    addEventListener('scroll', scroll, { passive: true }); addEventListener('resize', measure);
    return () => { cancelAnimationFrame(frame); removeEventListener('scroll', scroll); removeEventListener('resize', measure); };
  }, [stageRef]);
  return progress;
}

function Ruler({ reveal }: { reveal: number }) {
  return <div className="ruler" style={{ '--reveal': reveal } as CSSProperties} aria-label="0年から50年までのものさし">
    <div className="ruler-line" />
    <div className="ticks">{YEARS.map((year, i) => <div className="tick" key={year} style={{ '--delay': i / 7 } as CSSProperties}>
      <span className="tick-mark" /><span className="tick-year">{year}</span>{i === 0 && <span className="purchase">購入</span>}
    </div>)}</div>
  </div>;
}

function AnimatedStory() {
  const stageRef = useRef<HTMLElement>(null);
  const progress = useStoryProgress(stageRef);
  const state = getStoryState(progress);
  const vars = { '--camera-x': state.cameraX, '--camera-scale': state.cameraScale, '--sprite-x': SPRITES[state.lifeStage], '--step': Math.sin(state.walkPhase * Math.PI) * 3 } as CSSProperties;
  return <section ref={stageRef} className="story-scroll" aria-label="人生と不動産の50年の物語">
    <div className="story-sticky" style={vars}>
      <div className="story-world" aria-hidden="true" /><div className="sky-wash" aria-hidden="true" />
      <div className="brand-mark" aria-label="MONO-SASHI"><span className="brand-bars"><i /><i /><i /></span><span>MONO-SASHI</span></div>
      <div className="scene-copy opening" style={{ opacity: 1 - rangeProgress(progress, .08, .17) }}><p className="eyebrow">THE FIRST STEP</p><h1>まだ、<br />見ぬ未来へ。</h1><p>一歩を踏み出すと、<br />人生は動きはじめる。</p></div>
      <div className="scene-copy encounter-copy" style={{ opacity: state.encounter }}><p className="eyebrow">A NEW ENCOUNTER</p><h2>出会いが、<br />未来を動かす。</h2></div>
      <div className="decision-note" style={{ opacity: state.decision, transform: `translateY(${(1 - state.decision) * 12}px) rotate(-4deg)` }}>これにしよう</div>
      <Ruler reveal={state.rulerReveal} />
      <div className="character" role="img" aria-label="ものさしの上を未来へ歩く家族" />
      <div className="growth-copy" style={{ opacity: rangeProgress(progress, .43, .52) * (1 - rangeProgress(progress, .77, .86)) }}><p className="eyebrow">LIFE &amp; ASSET</p><h2>時間とともに、<br />人生が豊かになる。</h2></div>
      <div className="year-now" style={{ opacity: state.rulerReveal * (1 - state.finalReveal) }}><span>{YEARS[Math.min(6, Math.floor(rangeProgress(progress, .33, .9) * 6.99))]}</span><small>SCROLL TO THE FUTURE</small></div>
      <div className="final-message" style={{ opacity: state.finalReveal, transform: `translateY(${(1 - state.finalReveal) * 26}px)`, pointerEvents: state.finalReveal > .9 ? 'auto' : 'none' }}>
        <p className="final-kicker">MEASURE THE FUTURE</p><h2>未来は、<br />自分で選ぶ。</h2><div className="final-rule" /><p className="final-logo">MONO-SASHI</p><p className="final-sub">その物件の未来を、買う前に。</p>
        <a href="https://real-estate-investment-simulator.vercel.app/" className="cta">未来をシミュレーションする <span aria-hidden="true">→</span></a>
      </div>
      <div className="scroll-hint" style={{ opacity: 1 - rangeProgress(progress, .03, .1) }} aria-hidden="true"><span>SCROLL</span><i /></div>
    </div>
  </section>;
}

function StaticStory() {
  const panels = [['一本道','一本の道を、ひとりで歩きはじめる。'],['出会い','人と物件との出会いが、新しい選択をつくる。'],['ものさし','選んだ瞬間、道に時間の目盛りが現れる。'],['人生と資産','5年、10年、20年。建物と暮らしが育っていく。'],['家族','隣を歩く人が増え、選べる未来も増えていく。'],['豊かな未来','50年の先に、家族と街の穏やかな景色がある。']];
  return <section className="static-story" aria-label="MONO-SASHIの物語">{panels.map(([title,text],i)=><article key={title}><span>{String(i+1).padStart(2,'0')}</span><h2>{title}</h2><p>{text}</p></article>)}</section>;
}

export default function Home() {
  return <main><AnimatedStory /><StaticStory /><footer className="site-footer"><p>未来は、自分で選ぶ。</p><a href="https://real-estate-investment-simulator.vercel.app/">未来をシミュレーションする</a></footer></main>;
}
