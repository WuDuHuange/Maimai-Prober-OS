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

  function countUp(target: string | Element, start: number, end: number, duration = 1) {
    return gsap.fromTo(
      target,
      { textContent: start },
      {
        textContent: end,
        duration,
        ease: 'power1.out',
        snap: { textContent: 1 },
      }
    );
  }

  onBeforeUnmount(() => {
    animations.forEach(a => a.kill());
    animations.length = 0;
  });

  return { animateTo, animateFrom, staggerIn, pageFlip, countUp };
}
