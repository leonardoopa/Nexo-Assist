import { NexoMark } from "@/components/brand/nexo-mark";

// Illustrative figures, as in the prototype. Real numbers need production data.
const STATS = [
  { value: "8 s", label: "primeira resposta, em média", live: false },
  { value: "72%", label: "resolvidos sem fila", live: false },
  { value: "6", label: "analistas online agora", live: true },
];

export function LoginShowcase() {
  return (
    <aside className="hidden w-[55.5%] max-w-[800px] flex-none flex-col justify-between bg-ink px-12 pb-12 pt-10 text-white lg:flex xl:px-16">
      <div className="flex items-center gap-2.5">
        <NexoMark className="h-6 w-6 text-white" />
        <span className="text-[17px] font-bold tracking-[-0.2px]">Nexo Assist</span>
      </div>

      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-[18px]">
          <p className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</p>
          <h1 className="font-display text-[44px] leading-[1.04] tracking-[-1px] xl:text-[54px] xl:tracking-[-1.2px]">
            Seu problema de TI, resolvido em uma conversa.
          </h1>
          <p className="max-w-[520px] text-base leading-[1.55] text-white/65">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama
            um analista quando precisa.
          </p>
        </div>
        <ConversationPreview />
      </div>

      <dl className="flex border-t border-white/10 pt-6">
        {STATS.map((stat, index) => (
          <div
            key={stat.label}
            className={`flex flex-1 flex-col gap-1.5 ${index > 0 ? "border-l border-white/10 pl-6" : ""}`}
          >
            <dt className="order-2 text-[13.5px] text-white/55">{stat.label}</dt>
            <dd className="order-1 flex items-center gap-2 font-display text-[34px] tracking-[-0.6px]">
              {stat.value}
              {stat.live ? <span className="size-2 rounded-full bg-success" aria-hidden="true" /> : null}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function ConversationPreview() {
  return (
    <div
      aria-hidden="true"
      className="flex w-full max-w-[500px] flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-[18px] lg:ml-8 xl:ml-24"
    >
      <div className="flex justify-end">
        <p className="rounded-[12px_12px_4px_12px] bg-paper px-3.5 py-[9px] text-[13.5px] text-ink">
          Meu notebook não conecta na VPN. Erro 809.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-[12.5px]">
          <span className="font-semibold text-white/80">Nexo Assist</span>
          <span className="text-white/45">consultou seus chamados · criou um chamado</span>
        </p>
        <p className="w-[380px] max-w-full rounded-[4px_12px_12px_12px] bg-white/[0.08] px-3.5 py-2.5 text-[13.5px] leading-normal">
          Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
        </p>
        <p className="flex w-fit items-center gap-2 rounded-xl bg-paper px-3 py-[7px] text-[12.5px]">
          <span className="size-[7px] rounded-full bg-warning" />
          <span className="font-semibold text-ink">INC-20517</span>
          <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
        </p>
      </div>
    </div>
  );
}
