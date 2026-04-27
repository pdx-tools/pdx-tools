import { formatFloat } from "@/lib/format";
import type { EconomySection } from "@/wasm/wasm_eu5";

export function EconomyTabContent({ data }: { data: EconomySection }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {data.currentTaxBase != null && (
          <StatRow label="Current Tax" value={formatFloat(data.currentTaxBase, 2)} />
        )}
        {data.monthlyTradeValue != null && (
          <StatRow label="Monthly Trade" value={formatFloat(data.monthlyTradeValue, 2)} />
        )}
        {data.gold != null && <StatRow label="Gold" value={formatFloat(data.gold, 1)} />}
        {data.marketValue != null && (
          <StatRow label="Market Value" value={formatFloat(data.marketValue, 2)} />
        )}
        <StatRow label="Building Levels" value={formatFloat(data.totalBuildingLevels, 1)} />
        <StatRow label="Possible Tax" value={formatFloat(data.totalPossibleTax, 2)} />
      </div>

      {data.marketMembership.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Market membership
          </p>
          <div className="flex flex-col gap-1">
            {data.marketMembership.map((m) => (
              <div key={m.marketCenterName} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{m.marketCenterName}</span>
                <span className="font-mono text-xs text-slate-400">{m.locationCount} loc</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.topGoods.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Top goods
          </p>
          <div className="flex flex-col gap-1">
            {data.topGoods.map((g) => (
              <div key={g.goodName} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{g.goodName}</span>
                <span className="font-mono text-slate-400">
                  {formatFloat(g.price, 2)} · sup {formatFloat(g.supply, 1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
      <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-100">{value}</span>
    </div>
  );
}
