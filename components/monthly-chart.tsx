import { compactIDR } from "@/lib/format";

type DayValue = { day: number; value: number };

export function MonthlyChart({ data }: { data: DayValue[] }) {
  const max = Math.max(...data.map((x) => x.value), 1);
  const total = data.reduce((sum, x) => sum + x.value, 0);
  return (
    <section className="panel chartPanel">
      <div className="panelHeader"><div><span>Nilai Order Bulan Ini</span><strong>{compactIDR(total)}</strong></div><small>berdasarkan order dibuat</small></div>
      <div className="barChart" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }} aria-label="Grafik nilai order per hari">
        {data.map((item) => (
          <div className="barSlot" key={item.day} title={`Tanggal ${item.day}: ${compactIDR(item.value)}`}>
            <i style={{ height: `${Math.max((item.value / max) * 100, item.value ? 8 : 2)}%` }} />
          </div>
        ))}
      </div>
      <div className="chartAxis"><span>1</span><span>10</span><span>20</span><span>{data.length}</span></div>
    </section>
  );
}
