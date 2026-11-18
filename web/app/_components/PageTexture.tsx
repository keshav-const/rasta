// A subtle, fixed decorative layer so the light pages aren't a flat beige. Soft warm
// radial glows + the site's grain, very low opacity — adds depth without fighting the
// content. Sits behind everything (-z-10); pages drop their own opaque bg so it shows.
export function PageTexture() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-48 -top-40 h-[34rem] w-[34rem] rounded-full bg-vermilion/[0.07] blur-3xl" />
      <div className="absolute right-[-12rem] top-1/4 h-[36rem] w-[36rem] rounded-full bg-amber-200/25 blur-3xl" />
      <div className="absolute bottom-[-10rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-vermilion/[0.05] blur-3xl" />
      <div className="grain absolute inset-0 opacity-[0.35]" />
    </div>
  );
}
