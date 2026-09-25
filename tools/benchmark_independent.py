#!/usr/bin/env python3
"""
Independent benchmark implementation of the heat-load method (QA/QC, Gate 4).

Written separately from the JavaScript engine, directly from the published formulas:
  - ASHRAE Fundamentals psychrometrics (Hyland–Wexler saturation pressure, ideal-gas moist air)
  - Transmission U·A·ΔT with film coefficients, sun-effect allowance
  - Siebel product properties, sensible/latent product heat, packaging, respiration
  - Gosney & Olama door infiltration; air-change method (Dossat table, 70/√V, 35/√V, manual)
  - People 272 − 6t, lighting, forklifts, equipment, fans, defrost, safety factor, run time
Reads tests/fixtures/benchmark-inputs.json, writes tests/fixtures/benchmark-expected.json.
"""
import json, math, os

ROOT = os.path.join(os.path.dirname(__file__), '..')
IN = json.load(open(os.path.join(ROOT, 'tests', 'fixtures', 'benchmark-inputs.json')))
DATA = IN['data']


def num(v, d=0.0):
    if v is None or v == '' or isinstance(v, bool):
        return d
    try:
        x = float(v)
    except (TypeError, ValueError):
        return d
    return x if math.isfinite(x) else d


# ---------- psychrometrics (ASHRAE Fundamentals, ch. Psychrometrics) ----------
def p_ws(t):
    T = t + 273.15
    if t < 0:
        c = (-5.6745359e3, 6.3925247, -9.677843e-3, 6.2215701e-7, 2.0747825e-9, -9.484024e-13, 4.1635019)
        ln = c[0] / T + c[1] + c[2] * T + c[3] * T ** 2 + c[4] * T ** 3 + c[5] * T ** 4 + c[6] * math.log(T)
    else:
        c = (-5.8002206e3, 1.3914993, -4.8640239e-2, 4.1764768e-5, -1.4452093e-8, 6.5459673)
        ln = c[0] / T + c[1] + c[2] * T + c[3] * T ** 2 + c[4] * T ** 3 + c[5] * math.log(T)
    return math.exp(ln) / 1000.0  # kPa


def air(t, rh, p):
    pw = max(0.0, min(100.0, rh)) / 100.0 * p_ws(t)
    W = 0.621945 * pw / (p - pw)
    h = 1.006 * t + W * (2501 + 1.86 * t)
    v = 0.287042 * (t + 273.15) * (1 + 1.607858 * W) / p
    return {'t': t, 'W': W, 'h': h, 'v': v, 'rho': (1 + W) / v}


# ---------- components ----------
def room_load(room, proj):
    d = proj['design']
    Ti = num(room['cond']['T'])
    L, Wd, H = (num(room['dims'][k]) for k in ('L', 'W', 'H'))
    film = DATA['film']
    no_credit = d.get('heatLossCredit') == 'none'

    # transmission
    trans = 0.0
    for s in room['surfaces']:
        if num(s.get('areaOverride')) > 0:
            A = num(s['areaOverride'])
        elif s['key'] in ('wall1', 'wall3'):
            A = L * H
        elif s['key'] in ('wall2', 'wall4'):
            A = Wd * H
        else:
            A = L * Wd
        if num(s.get('uOverride')) > 0:
            U = num(s['uOverride'])
        else:
            ins = DATA['insulation'].get(s.get('ins')) or DATA['insulation']['PUR']
            r_ins = 0.0 if s.get('ins') == 'NONE' else num(s.get('thk')) / 1000.0 / ins['k']
            r_out = 0.0 if s['adj'] == 'ground' else 1.0 / (film['outside'] if s['adj'] == 'ambient' else film['adjacent'])
            U = 1.0 / (1.0 / film['inside'] + r_ins + r_out + num(s.get('rExtra')))
        if s['adj'] == 'ambient':
            sun = DATA['sunEffect'].get(s.get('sun')) or DATA['sunEffect']['none']
            orient = 'roof' if s['key'] == 'ceiling' else (s.get('orient') or 'N')
            To = num(d['ambientDB']) + sun.get(orient, 0)
        elif s['adj'] == 'ground':
            To = num(s.get('tAdj'), num(d.get('groundTemp'), 10))
        else:
            To = num(s.get('tAdj'))
        q = U * A * (To - Ti) / 1000.0 * 24.0
        trans += max(0.0, q) if no_credit else q

    # product
    prod = pack = resp = 0.0
    prod_items = []
    for p in room.get('products', []):
        ref = next((x for x in DATA['products'] if x['id'] == p.get('productId')), {})
        xw = num(p.get('xw'), ref.get('xw', 0)) / 100.0
        Tf = num(p.get('Tf'), ref.get('Tf', 0))
        cpa, cpb, hif = 3.35 * xw + 0.84, 1.26 * xw + 0.84, 334.0 * xw
        if num(p.get('cpA')) > 0: cpa = num(p['cpA'])
        if num(p.get('cpB')) > 0: cpb = num(p['cpB'])
        if num(p.get('hLat')) > 0: hif = num(p['hLat'])
        T1, T2 = num(p.get('tIn')), num(p.get('tOut'), Ti)
        if T2 >= T1: q = 0.0
        elif T2 >= Tf: q = cpa * (T1 - T2)
        elif T1 > Tf: q = cpa * (T1 - Tf) + hif + cpb * (Tf - T2)
        else: q = cpb * (T1 - T2)
        pull = max(1.0, min(24.0, num(p.get('pullDown'), 24)))
        crf = min(1.0, num(p['crf'])) if num(p.get('crf')) > 0 else 1.0
        m = num(p.get('mass'))
        day = m * q / 3600.0 / crf
        prod += day * 24.0 / pull
        pk = DATA['packaging'].get(p.get('packType')) or DATA['packaging']['cardboard']
        pack += m * num(p.get('packPct')) / 100.0 * pk['cp'] * max(0.0, T1 - T2) / 3600.0 * 24.0 / pull
        resp += num(p.get('stored')) / 1000.0 * num(p.get('resp'), ref.get('resp') or 0) * 24.0 / 1000.0
        resp += m / 1000.0 * num(p.get('respIn')) * 24.0 / 1000.0
        prod_items.append((day, day * 24.0 / pull, pull))

    # infiltration and ventilation
    P = 101.325 * (1 - 2.25577e-5 * num(d.get('altitude'))) ** 5.2559
    inside = air(Ti, num(room['cond']['RH']), P)
    outdoor = air(num(d['ambientDB']), num(d['ambientRH']), P)
    V = L * Wd * H
    infl = 0.0
    if room.get('infMethod') == 'airchange':
        ac = room.get('airChange') or {}
        src = air(num(ac.get('tAdj')), num(ac.get('rhAdj')), P) if ac.get('adj') == 'custom' else outdoor
        method = ac.get('method')
        if method == 'store':
            n = 70.0 / math.sqrt(max(V, 1)) * num(ac.get('f'), 1)
        elif method == 'dock':
            n = 35.0 / math.sqrt(max(V, 1)) * 24.0 * num(ac.get('fn'), 1)
        elif method == 'manual':
            n = num(ac.get('nManual'), 2)
        else:
            # Dossat table, log-log interpolation in ft³
            Vft, tab = V * 35.3147, DATA['airChanges']
            col = 2 if Ti < 0 else 1
            i = next((j for j, r in enumerate(tab) if r[0] >= Vft), len(tab) - 1)
            i = max(i, 1)
            v0, v1, a0, a1 = tab[i - 1][0], tab[i][0], tab[i - 1][col], tab[i][col]
            n = a0 * (max(Vft, 1) / v0) ** (math.log(a1 / a0) / math.log(v1 / v0))
            n *= (DATA['usageFactors'].get(ac.get('usage')) or DATA['usageFactors']['average'])['f']
        infl = max(0.0, V * n / src['v'] * (src['h'] - inside['h'])) / 3600.0
    else:
        for dr in room.get('doors', []):
            o = outdoor if dr.get('adj') == 'ambient' else air(num(dr.get('tAdj')), num(dr.get('rhAdj')), P)
            A, Hd = num(dr.get('w')) * num(dr.get('h')), num(dr.get('h'))
            ri, rr, dh = o['rho'], inside['rho'], o['h'] - inside['h']
            if ri >= rr or dh <= 0:
                continue
            Fm = (2.0 / (1.0 + (rr / ri) ** (1.0 / 3.0))) ** 1.5
            q_open = 0.221 * A * dh * rr * math.sqrt(1 - ri / rr) * math.sqrt(9.81 * Hd) * Fm
            open_h = (num(dr.get('passages')) * num(dr.get('openSec')) + 60 * num(dr.get('standMin'))) / 3600.0
            Df = num(dr.get('Df')) if num(dr.get('Df')) > 0 else (0.8 if o['t'] - inside['t'] > 11 else 1.1)
            prot = DATA['doorProtection'].get(dr.get('protection')) or DATA['doorProtection']['none']
            E = num(dr.get('E')) if dr.get('protection') == 'custom' else prot['E']
            infl += q_open * open_h * Df * (1 - E)
    vent = 0.0
    Vv = num((room.get('ventilation') or {}).get('m3h'))
    if Vv > 0:
        vent = max(0.0, Vv / 3600.0 / outdoor['v'] * (outdoor['h'] - inside['h'])) * num(room['ventilation'].get('hours'), 24)

    # internal
    i = room.get('internal') or {}
    people = num(i.get('people')) * (272 - 6 * Ti) * num(i.get('peopleHours')) / 1000.0
    lights = num(i.get('lightsWm2')) * L * Wd * num(i.get('lightsHours')) / 1000.0
    fork = num(i.get('forklifts')) * num(i.get('forkliftKW')) * num(i.get('forkliftHours'))
    other = num(i.get('otherKW')) * num(i.get('otherHours'))
    base = trans + prod + pack + resp + infl + vent + people + lights + fork + other

    e = room.get('equipment') or {}
    fans = num(e.get('fanKW')) * num(e.get('fanHours'), 24) if e.get('fanMode') == 'kw' else max(0.0, base) * num(e.get('fanPct'), 5) / 100.0
    defrost = num(e.get('defrostKW')) * num(e.get('defrostPerDay')) * num(e.get('defrostMin')) / 60.0 * num(e.get('defrostFrac'), 30) / 100.0
    subtotal = base + fans + defrost
    sf = num(room.get('safety'), num(d.get('safetyFactor'), 10))
    total = subtotal * (1 + sf / 100.0)
    run = max(1.0, min(24.0, num(room.get('runHours'), 18)))
    cap = total / run
    if room.get('productBasis') == 'pulldown':
        for day, equiv, pull in prod_items:
            cap += day * (1 + sf / 100) / min(pull, run) - equiv * (1 + sf / 100) / run
    return {'transmission': trans, 'product': prod, 'packaging': pack, 'respiration': resp, 'infiltration': infl,
            'ventilation': vent, 'people': people, 'lights': lights, 'forklifts': fork, 'other': other,
            'fans': fans, 'defrost': defrost, 'subtotal': subtotal, 'total': total, 'capacity': cap}


def u_value(ins_key, thk_mm, adj, r_extra=0.0):
    film = DATA['film']
    ins = DATA['insulation'].get(ins_key) or DATA['insulation']['PUR']
    r_ins = 0.0 if ins_key == 'NONE' else thk_mm / 1000.0 / ins['k']
    r_out = 0.0 if adj == 'ground' else 1.0 / (film['outside'] if adj == 'ambient' else film['adjacent'])
    return 1.0 / (1.0 / film['inside'] + r_ins + r_out + r_extra)


def gosney(A, H, inside, out):
    ri, rr, dh = out['rho'], inside['rho'], out['h'] - inside['h']
    if ri >= rr or dh <= 0:
        return 0.0
    Fm = (2.0 / (1.0 + (rr / ri) ** (1.0 / 3.0))) ** 1.5
    return 0.221 * A * dh * rr * math.sqrt(1 - ri / rr) * math.sqrt(9.81 * H) * Fm


SHAPE = {'slab': (0.5, 0.125, 1), 'cylinder': (0.25, 1 / 16, 2), 'sphere': (1 / 6, 1 / 24, 3)}


def tunnel_load(t, proj):
    lib = {p['id']: p for p in IN['lib']}
    ref = lib.get(t['product'].get('libId'), {})
    val = lambda k: ref.get(k) if t['product'].get(k) in ('', None) else float(t['product'][k])
    Tf, cpa, cpb, L = num(val('Tf'), -1), num(val('cpA')), num(val('cpB')), num(val('hLat'))
    kf, rho_u, rho_f = num(t['product'].get('kF'), 1.4), num(t['product'].get('rhoU'), 1050), num(t['product'].get('rhoF'), 1000)
    P_, R_, E_ = SHAPE[t['shape']]
    Dm = num(t['D']); h = 1.0 / (1.0 / num(t['hAir']) + num(t['Rpack']))
    Tm, Ti, Tc = num(t['Tm']), num(t['Ti']), num(t['Tc'])
    plank = rho_f * L * 1000 / (Tf - Tm) * (P_ * Dm / h + R_ * Dm ** 2 / kf) / 3600
    d = Dm / 2; Tfm = 1.8 + 0.263 * Tc + 0.105 * Tm
    dH1 = max(0.0, rho_u * cpa * 1000 * (Ti - Tfm)); dH2 = rho_f * (L * 1000 + cpb * 1000 * (Tfm - Tc))
    pham = d / (E_ * h) * (dH1 / ((Ti + Tfm) / 2 - Tm) + dH2 / (Tfm - Tm)) * (1 + h * d / kf / 2) / 3600
    tfz = plank if t['timeBasis'] == 'plank' else num(t.get('tDesign')) if t['timeBasis'] == 'entered' else pham
    T1 = Ti; T2 = Tc if t.get('T2') in ('', None) else num(t['T2'])
    batch = t['mode'] != 'continuous'
    m = num(t['batchKg']) / tfz if batch else num(t['throughput'])
    peak = num(t.get('peak'), 1) or 1
    qa = m * cpa * (T1 - max(Tf, T2)) / 3600 if T1 > Tf else 0.0
    ql = m * L / 3600 if (T2 < Tf < T1) else 0.0
    qb = m * cpb * (min(Tf, T1) - T2) / 3600 if T2 < Tf else 0.0
    product = (qa + ql + qb) * peak
    dT = max(0.0, T1 - T2)
    pack = m * num(t['packPct']) / 100 * num(t.get('packCp'), 1.34) * dT / 3600 * peak
    troll = num(t.get('trolleyKg')) * num(t.get('trolleyCp'), 0.5) * dT / (tfz * 3600) if batch else 0.0
    Ld, Wd, Hd = (num(t['dims'][k]) for k in ('L', 'W', 'H'))
    aw, af = 2 * (Ld + Wd) * Hd + Ld * Wd, Ld * Wd
    trans = (u_value(t['ins'], num(t['thk']), 'custom') * aw * (num(t['tSur']) - Tm) + u_value(t['floorIns'], num(t['floorThk']), 'ground', 0.1) * af * (num(t['groundT'], num(proj['design'].get('groundTemp'), 10)) - Tm)) / 1000
    P = 101.325 * (1 - 2.25577e-5 * num(proj['design'].get('altitude'))) ** 5.2559
    inside = air(Tm, 90, P)
    infl = 0.0
    if batch:
        for dr in t.get('doors', []):
            q = gosney(num(dr['w']) * num(dr['h']), num(dr['h']), inside, air(num(dr['tAdj']), num(dr['rhAdj']), P))
            E = num(dr.get('E')) if dr.get('protection') == 'custom' else (DATA['doorProtection'].get(dr.get('protection')) or DATA['doorProtection']['none'])['E']
            infl += q * num(dr['openPerCycle']) * num(dr['openSec']) / 3600 * 0.8 * (1 - E) / tfz
    elif num(t['belt'].get('area')) > 0:
        b = t['belt']
        infl = gosney(num(b['area']), num(b['h']), inside, air(num(b['tAdj']), num(b['rhAdj']), P)) * 0.8 * (1 - num(b.get('E')))
    sub = product + pack + troll + trans + infl + num(t['fanKW']) + num(t['lightsKW']) + num(t['otherKW']) + num(t['defrostKW'])
    x = num(t['lossPct']) / 100
    total = sub * (1 + x) if t.get('lossMethod') == 'factor' else sub / (1 - x)
    return {'plankH': plank, 'phamH': pham, 'mdot': m, 'product': product, 'packaging': pack, 'trolleys': troll,
            'transmission': trans, 'infiltration': infl, 'subtotal': sub, 'total': total}


out = {name: [room_load(r, proj) for r in proj['rooms']] for name, proj in IN['cases'].items()}
tunnels = {name: [tunnel_load(t, proj) for t in proj.get('tunnels', [])] for name, proj in IN['cases'].items() if proj.get('tunnels')}
json.dump(tunnels, open(os.path.join(ROOT, 'tests', 'fixtures', 'benchmark-tunnels-expected.json'), 'w'), indent=1)
print('independent tunnel benchmark:', sum(len(v) for v in tunnels.values()), 'tunnels')
json.dump(out, open(os.path.join(ROOT, 'tests', 'fixtures', 'benchmark-expected.json'), 'w'), indent=1)
print('independent benchmark:', sum(len(v) for v in out.values()), 'rooms in', len(out), 'cases')
