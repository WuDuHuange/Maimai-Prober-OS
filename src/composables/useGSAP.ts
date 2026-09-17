import gsap from 'gsap';
import { onBeforeUnmount } from 'vue';

export function useGSAP() {
  const animations: gsap.core.Tween[] = [];

  function animateTo(target: string | Element | string[] | Element[], vars: gsap.TweenVars) {
    const tween = gsap.to(target, vars);
    animations.push(tween);
    return tween;
  }

  function animateFrom(target: string | Element | string[] | Element[], vars: gsap.TweenVars) {
    const tween = gsap.from(target, vars);
    animations.push(tween);
    return tween;
  }

  function staggerIn(target: string | Element | string[] | Element[], stagger = 0.08) {
    return gsap.from(target, {
      opacity: 0,
      y: 20,
      duration: 0.4,
      stagger,
      ease: 'power2.out',
    });
  }

  function pageFlip(container: string | Element, direction: 'next' | 'prev') {
    const x = direction === 'next' ? 80 : -80;
    return gsap.fromTo(
      container,
      { x, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }
    );
  }

  /**
   * 数字滚动动画。
   * 通过 onUpdate 手动写入 textContent，不依赖 gsap 的 TextPlugin
   * （TextPlugin 未注册时 textContent tween 不会生效）。
   */
  function countUp(
    target: string | Element,
    start: number,
    end: number,
    duration = 1,
    decimals = 0,
    format?: (v: number) => string,
  ) {
    const els = typeof target === 'string'
      ? Array.from(document.querySelectorAll<HTMLElement>(target))
      : [target as HTMLElement];

    const render = (v: number) => (format ? format(v) : v.toFixed(decimals));
    const state = { v: start };
    const tween = gsap.to(state, {
      v: end,
      duration,
      ease: 'power1.out',
      onUpdate: () => {
        const text = render(state.v);
        for (const el of els) el.textContent = text;
      },
      onComplete: () => {
        const text = render(end);
        for (const el of els) el.textContent = text;
      },
    });
    animations.push(tween);
    return tween;
  }

  onBeforeUnmount(() => {
    animations.forEach(a => a.kill());
    animations.length = 0;
  });

  return { animateTo, animateFrom, staggerIn, pageFlip, countUp };
}
