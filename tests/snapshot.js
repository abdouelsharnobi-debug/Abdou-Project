/* Reduce engine output to the engineering numbers that must stay stable. */
const r6 = (x) => (Number.isFinite(x) ? +x.toPrecision(10) : x);

function snapshotRoom(room, res) {
  const b = Object.fromEntries(res.breakdown.map((x) => [x.key, r6(x.kWh)]));
  return {
    name: room.name, breakdown: b,
    subtotal: r6(res.subtotal), total: r6(res.total), capacity: r6(res.capacity),
    sst: r6(res.sst), frostKgDay: r6(res.frostKgDay), kcalM3Day: r6(res.kcalM3Day),
    surfaces: res.transmission.items.map((s) => [r6(s.U), r6(s.A), r6(s.dT), r6(s.kW)]),
    products: res.product.items.map((p) => [r6(p.qkg), r6(p.kWh)]),
    doors: res.infiltration.items.map((d) => [r6(d.qOpen), r6(d.openH), r6(d.kWh)]),
    airChange: res.infiltration.airChange ? [r6(res.infiltration.airChange.n), r6(res.infiltration.airChange.kWh)] : null,
  };
}

function snapshotVent(r) {
  return {
    heatKW: r6(r.heatKW),
    normal: r6(r.normal.design.m3h), continuous: r6(r.continuous.design.m3h), emergency: r6(r.emergency.design.m3h),
  };
}

module.exports = { snapshotRoom, snapshotVent };
