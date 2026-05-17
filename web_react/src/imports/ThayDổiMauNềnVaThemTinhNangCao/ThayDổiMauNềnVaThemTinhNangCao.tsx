import svgPaths from "./svg-eevstm7ywm";

function Icon() {
  return (
    <div className="relative shrink-0 size-[19.993px]" data-name="Icon">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9935 19.9935">
        <g clipPath="url(#clip0_8_140)" id="Icon">
          <path d={svgPaths.p213432bc} id="Vector" stroke="var(--stroke-0, #1E1E1E)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66613" />
          <path d={svgPaths.p11d1bc80} id="Vector_2" stroke="var(--stroke-0, #1E1E1E)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66613" />
        </g>
        <defs>
          <clipPath id="clip0_8_140">
            <rect fill="white" height="19.9935" width="19.9935" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function ReadingScreen() {
  return (
    <div className="bg-[rgba(255,255,255,0.95)] content-stretch flex items-center justify-center px-[14.003px] py-[0.819px] relative rounded-[27487600px] shrink-0 size-[48px]" data-name="ReadingScreen">
      <div aria-hidden="true" className="absolute border-[0.819px] border-[rgba(0,0,0,0.1)] border-solid inset-0 pointer-events-none rounded-[27487600px] shadow-[0px_10px_15px_0px_rgba(0,0,0,0.1),0px_4px_6px_0px_rgba(0,0,0,0.1)]" />
      <Icon />
    </div>
  );
}

export default function ThayDiMauNnVaThemTinhNangCao() {
  return (
    <div className="bg-white content-stretch flex flex-col items-center justify-center p-[16px] relative size-full" data-name="Thay đổi màu nền và thêm tính năng cào">
      <ReadingScreen />
    </div>
  );
}