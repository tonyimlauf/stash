import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

const API = 'https://valorant-api.com/v1'
const TIER_VP = { select: 875, deluxe: 1275, premium: 1775, ultra: 2475, exclusive: 2975 }

// weapon order within each category (Valorant collection order)
const WORDER = {
  Pistol: ['Classic', 'Shorty', 'Frenzy', 'Ghost', 'Sheriff'],
  SMG: ['Stinger', 'Spectre'],
  Shotgun: ['Bucky', 'Judge'],
  Rifle: ['Bulldog', 'Guardian', 'Phantom', 'Vandal'],
  Sniper: ['Marshal', 'Outlaw', 'Operator'],
  Heavy: ['Ares', 'Odin'],
  Melee: ['Melee'],
}
// per-weapon tile size — Phantom/Vandal are the dominant central rectangles
const WEIGHT = { Phantom: 1.85, Vandal: 1.85, Operator: 1.35, Spectre: 1.25, Sheriff: 1.2, Odin: 1.2, Ghost: 1.1, Guardian: 1.1, Judge: 1.1 }

const vpForTier = (n) => { if (!n) return 0; const k = n.toLowerCase(); for (const t in TIER_VP) if (k.includes(t)) return TIER_VP[t]; return 0 }
const hexRGBA = (s) => (s ? '#' + s.slice(0, 6) : '#B7A98A')
const catName = (raw) => { const c = (raw || '').split('::').pop(); return c === 'Sidearm' ? 'Pistol' : (c || 'Gun') }
const fmt = (n) => (n || 0).toLocaleString('cs-CZ').replace(/\s/g, ' ')
const weightFor = (name) => WEIGHT[name] || 1
const skinImageUrl = (s, ci, w) => { if (!s) return w.img; if (s.isStandard) return w.img; const c = s.chromas[ci]; return (c && c.img) || s.img || w.img }

// column layout — mirrors Valorant: Sidearms | SMGs+Shotguns+Melee | Rifles | Snipers+Machine guns
function colsConfig(w) {
  if (w >= 1024) return [
    [['Pistol', 'SIDEARMS']],
    [['SMG', 'SMGS'], ['Shotgun', 'SHOTGUNS'], ['Melee', 'MELEE']],
    [['Rifle', 'RIFLES']],
    [['Sniper', 'SNIPER RIFLES'], ['Heavy', 'MACHINE GUNS']],
  ]
  if (w >= 640) return [
    [['Pistol', 'SIDEARMS'], ['SMG', 'SMGS'], ['Shotgun', 'SHOTGUNS'], ['Melee', 'MELEE']],
    [['Rifle', 'RIFLES'], ['Sniper', 'SNIPER RIFLES'], ['Heavy', 'MACHINE GUNS']],
  ]
  return [[['Pistol', 'SIDEARMS'], ['SMG', 'SMGS'], ['Shotgun', 'SHOTGUNS'], ['Rifle', 'RIFLES'], ['Sniper', 'SNIPER RIFLES'], ['Heavy', 'MACHINE GUNS'], ['Melee', 'MELEE']]]
}

// ---- build the dataset from the API response ----
function buildFromApi(weapons, tiers, buddies) {
  const skins = {}, weaponList = [], byCat = {}
  const tm = {}; tiers.forEach((t) => { tm[t.uuid] = { name: t.devName, color: hexRGBA(t.highlightColor) } })
  weapons.forEach((wp) => {
    const cat = catName(wp.category); const skinIds = []
    ;(wp.skins || []).forEach((sk) => {
      if (/random/i.test(sk.displayName)) return
      const tier = tm[sk.contentTierUuid] || null
      const isStd = !sk.contentTierUuid && /standard/i.test(sk.displayName || '')
      // build chromas and their clips from one filtered pipeline so they stay index-aligned: chroma i ↔ videos[i]
      const chromaList = (sk.chromas || [])
        .map((c) => ({ name: c.displayName, img: c.fullRender || c.displayIcon, swatch: c.swatch || c.fullRender || c.displayIcon, video: c.streamedVideo || null }))
        .filter((c) => c.img)
      const chromas = chromaList.map((c) => ({ name: c.name, img: c.img, swatch: c.swatch }))
      const baseImg = sk.displayIcon || (chromas[0] && chromas[0].img) || (sk.levels || []).map((l) => l.displayIcon).find(Boolean) || wp.displayIcon
      // the base style's clip lives on the skin levels, not on chroma[0] — use it as the base video
      const levelVideo = (sk.levels || []).map((l) => l.streamedVideo).filter(Boolean).pop() || null
      // one clip per chroma (levels mostly reuse the same clip, chromas don't); null where a chroma has none
      const videos = chromaList.map((c, i) => c.video || (i === 0 ? levelVideo : null))
      skins[sk.uuid] = {
        uuid: sk.uuid, name: sk.displayName, weapon: wp.displayName, weaponUuid: wp.uuid, cat,
        tierName: tier ? tier.name : null, tint: tier ? tier.color : '#B7A98A',
        price: vpForTier(tier ? tier.name : null), chromas, img: baseImg, isStandard: isStd, videos,
      }
      skinIds.push(sk.uuid)
    })
    const wo = { uuid: wp.uuid, name: wp.displayName, cat, img: wp.displayIcon, skinIds }
    weaponList.push(wo)
    ;(byCat[cat] = byCat[cat] || []).push(wo)
  })
  const buds = (buddies || []).filter((b) => b.displayIcon).map((b) => ({ uuid: b.uuid, name: b.displayName, img: b.displayIcon }))
  return { skins, weapons: weaponList, byCat, buddies: buds }
}

// ---- tiny offline fallback so the UI always lives ----
function buildFallback() {
  const T = { Premium: '#D1548D', Ultra: '#F9A21B', Exclusive: '#EB4B4F', Deluxe: '#1FA6A6', Select: '#4FB477' }
  const data = [
    ['Classic', 'Pistol', [['Prime Classic', 'Deluxe'], ['Reaver Classic', 'Premium']]], ['Shorty', 'Pistol', [['Wasteland Shorty', 'Deluxe']]],
    ['Frenzy', 'Pistol', [['Sovereign Frenzy', 'Premium']]], ['Ghost', 'Pistol', [['Sovereign Ghost', 'Premium'], ['Oni Ghost', 'Premium']]],
    ['Sheriff', 'Pistol', [['Reaver Sheriff', 'Premium'], ['Prime Sheriff', 'Deluxe']]], ['Stinger', 'SMG', [['Glitchpop Stinger', 'Premium']]],
    ['Spectre', 'SMG', [['Glitchpop Spectre', 'Premium'], ['Sovereign Spectre', 'Premium']]], ['Bucky', 'Shotgun', [['Oni Bucky', 'Premium']]],
    ['Judge', 'Shotgun', [['Prime Judge', 'Deluxe']]], ['Bulldog', 'Rifle', [['RGX Bulldog', 'Premium']]], ['Guardian', 'Rifle', [['Prime Guardian', 'Premium']]],
    ['Phantom', 'Rifle', [['Reaver Phantom', 'Premium'], ['Ion Phantom', 'Premium']]], ['Vandal', 'Rifle', [['Prime Vandal', 'Premium'], ['Reaver Vandal', 'Premium']]],
    ['Marshal', 'Sniper', [['Ego Marshal', 'Deluxe']]], ['Outlaw', 'Sniper', [['Araxys Outlaw', 'Premium']]],
    ['Operator', 'Sniper', [['Glitchpop Operator', 'Premium'], ['Elderflame Operator', 'Ultra']]], ['Ares', 'Heavy', [['RGX Ares', 'Premium']]],
    ['Odin', 'Heavy', [['RGX Odin', 'Premium']]], ['Melee', 'Melee', [['Elderflame Dagger', 'Ultra'], ['Champions Karambit', 'Exclusive']]],
  ]
  const skins = {}, weaponList = [], byCat = {}
  data.forEach((d, wi) => {
    const wid = 'w' + wi; const skinIds = []
    const stdId = wid + '-std'
    skins[stdId] = { uuid: stdId, name: 'Standard ' + d[0], weapon: d[0], weaponUuid: wid, cat: d[1], tierName: null, tint: '#B7A98A', price: 0, chromas: [], img: null, isStandard: true, videos: [] }
    skinIds.push(stdId)
    d[2].forEach((s, si) => {
      const id = wid + '-' + si
      skins[id] = { uuid: id, name: s[0], weapon: d[0], weaponUuid: wid, cat: d[1], tierName: s[1], tint: T[s[1]], price: vpForTier(s[1]), chromas: [], img: null, isStandard: false, videos: [] }
      skinIds.push(id)
    })
    const wo = { uuid: wid, name: d[0], cat: d[1], img: null, skinIds }
    weaponList.push(wo)
    ;(byCat[d[1]] = byCat[d[1]] || []).push(wo)
  })
  return { skins, weapons: weaponList, byCat, buddies: [] }
}

// default skin = standard, then pre-equip a few nice ones into "my"
function defaultSkin(db, w) { return w.skinIds.find((id) => db.skins[id].isStandard) || w.skinIds[0] }
function initLoadouts(db) {
  const make = () => { const m = {}; db.weapons.forEach((w) => { const skinUuid = defaultSkin(db, w); m[w.uuid] = { skinUuid, chromaIndex: 0, buddyId: null, owned: [skinUuid] } }); return m }
  const my = make(), dream = make()
  const want = ['Prime Vandal', 'Reaver Phantom', 'Glitchpop Operator', 'Reaver Sheriff', 'Prime Classic', 'Elderflame Dagger', 'Glitchpop Spectre', 'Sovereign Ghost', 'Prime Guardian', 'RGX Odin', 'Oni Bucky', 'RGX Bulldog', 'Araxys Outlaw']
  want.forEach((q) => {
    const id = Object.keys(db.skins).find((u) => db.skins[u].name.toLowerCase().includes(q.toLowerCase()) && !db.skins[u].isStandard)
    if (id) { const s = db.skins[id]; my[s.weaponUuid] = { skinUuid: id, chromaIndex: 0, buddyId: null, owned: [id] } }
  })
  return { my, dream }
}

export default function App() {
  const [db, setDb] = useState(null)
  const [inv, setInv] = useState('my')
  const [items, setItems] = useState({ my: {}, dream: {} })
  const [featuredMap, setFeaturedMap] = useState({ my: null, dream: null })
  const [weaponTarget, setWeaponTarget] = useState(null) // weapon uuid for the big modal
  const [buddyTarget, setBuddyTarget] = useState(null)    // weapon uuid we're attaching a buddy to
  const [skinSearch, setSkinSearch] = useState('')
  const [browseAll, setBrowseAll] = useState(false)
  const [confirmAdd, setConfirmAdd] = useState(null) // skin uuid pending "add to owned" confirmation
  const [previewTab, setPreviewTab] = useState('photo') // 'photo' | 'video' — wprev media tab for the equipped skin (video variant follows the chroma selector)
  const [videoPlaying, setVideoPlaying] = useState(true)
  const videoRef = useRef(null)
  const [confirmTab, setConfirmTab] = useState('photo') // same trio, scoped to the skin pending confirmation
  const [confirmVideoIndex, setConfirmVideoIndex] = useState(0)
  const [confirmVideoPlaying, setConfirmVideoPlaying] = useState(true)
  const confirmVideoRef = useRef(null)
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const [colH, setColH] = useState(null)
  const gridRef = useRef(null)
  const modeExitRef = useRef(null) // { mode, search, time } snapshot taken when leaving a skin-picker mode

  // load data once
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [wR, tR, bR] = await Promise.all([fetch(`${API}/weapons`), fetch(`${API}/contenttiers`), fetch(`${API}/buddies`)])
        const built = buildFromApi((await wR.json()).data, (await tR.json()).data, (await bR.json()).data)
        if (!alive) return
        setDb(built); setItems(initLoadouts(built))
      } catch (e) {
        const fb = buildFallback()
        if (!alive) return
        setDb(fb); setItems(initLoadouts(fb))
      }
    })()
    return () => { alive = false }
  }, [])

  // track viewport width
  useEffect(() => {
    const onR = () => setVw(window.innerWidth)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])

  // close modals with Escape
  useEffect(() => {
    const onK = (e) => { if (e.key === 'Escape') { setWeaponTarget(null); setBuddyTarget(null) } }
    window.addEventListener('keydown', onK)
    return () => window.removeEventListener('keydown', onK)
  }, [])

  // reset skin search/browse state whenever a different weapon modal opens
  useEffect(() => { setSkinSearch(''); setBrowseAll(false); setConfirmAdd(null); modeExitRef.current = null }, [weaponTarget])

  // reset the equipped-skin media preview whenever the open weapon or its equipped skin changes
  const equippedSkinUuid = weaponTarget ? items[inv][weaponTarget]?.skinUuid : null
  useEffect(() => { setPreviewTab('photo'); setVideoPlaying(true) }, [equippedSkinUuid])

  // reset the confirm-popup media preview whenever a different skin is targeted
  useEffect(() => { setConfirmTab('photo'); setConfirmVideoIndex(0); setConfirmVideoPlaying(true) }, [confirmAdd])

  // switch between "owned" and "browse all" — clears the search, unless you flip back
  // within 2s of leaving a mode (likely a misclick), in which case its search is restored
  const switchMode = (toAll) => {
    if (toAll === browseAll) return
    const exit = modeExitRef.current
    const now = Date.now()
    if (exit && exit.mode === toAll && now - exit.time <= 2000) {
      setSkinSearch(exit.search)
      modeExitRef.current = null
    } else {
      modeExitRef.current = { mode: browseAll, search: skinSearch, time: now }
      setSkinSearch('')
    }
    setBrowseAll(toAll)
  }

  const cols = useMemo(() => colsConfig(vw), [vw])
  const multi = cols.length > 1

  // size column height so the wall is one flush rectangle and (almost) fits the screen
  useLayoutEffect(() => {
    if (!db || !multi) { setColH(null); return }
    const el = gridRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    const avail = window.innerHeight - top - 14
    const H = Math.max(vw >= 1024 ? 580 : 520, avail)
    setColH(H)
  }, [db, vw, multi])

  const active = items[inv]
  const equipOf = (wid) => active[wid]
  const priceOf = (wid) => { const e = active[wid]; return e ? db.skins[e.skinUuid].price : 0 }
  const weaponsOf = (cat) => {
    const arr = (db.byCat[cat] || []).slice(); const ord = WORDER[cat] || []
    return arr.sort((a, b) => { const ia = ord.indexOf(a.name), ib = ord.indexOf(b.name); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name) })
  }

  const featuredW = useMemo(() => {
    if (!db) return null
    const ov = featuredMap[inv]
    if (ov && active[ov]) return db.weapons.find((w) => w.uuid === ov)
    const real = db.weapons.filter((w) => priceOf(w.uuid) > 0)
    if (!real.length) return null
    let max = -1; real.forEach((w) => { const p = priceOf(w.uuid); if (p > max) max = p })
    const top = real.filter((w) => priceOf(w.uuid) === max)
    return top.find((w) => /phantom/i.test(w.name)) || top.find((w) => /vandal/i.test(w.name)) || top[0]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, items, inv, featuredMap])

  const totals = useMemo(() => {
    if (!db) return { sum: 0, owned: 0, high: 0, total: 0 }
    const sum = db.weapons.reduce((a, w) => a + priceOf(w.uuid), 0)
    const owned = db.weapons.filter((w) => priceOf(w.uuid) > 0).length
    const high = db.weapons.filter((w) => { const t = (db.skins[active[w.uuid].skinUuid].tierName || '').toLowerCase(); return t.includes('ultra') || t.includes('exclusive') }).length
    return { sum, owned, high, total: db.weapons.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, items, inv])

  // ---- immutable updates ----
  const setSkin = (wid, skinUuid) => setItems((p) => {
    const cur = p[inv][wid]
    const owned = (cur.owned || []).includes(skinUuid) ? cur.owned : [...(cur.owned || []), skinUuid]
    return { ...p, [inv]: { ...p[inv], [wid]: { ...cur, skinUuid, chromaIndex: 0, owned } } }
  })
  const removeOwned = (wid, skinUuid) => setItems((p) => {
    const cur = p[inv][wid]
    const owned = (cur.owned || []).filter((u) => u !== skinUuid)
    const equippedRemoved = cur.skinUuid === skinUuid
    const w = db.weapons.find((x) => x.uuid === wid)
    const skinUuidNext = equippedRemoved ? defaultSkin(db, w) : cur.skinUuid
    return { ...p, [inv]: { ...p[inv], [wid]: { ...cur, owned, skinUuid: skinUuidNext, chromaIndex: equippedRemoved ? 0 : cur.chromaIndex } } }
  })
  const setChroma = (wid, ci) => setItems((p) => ({ ...p, [inv]: { ...p[inv], [wid]: { ...p[inv][wid], chromaIndex: ci } } }))
  const setBuddy = (wid, buddyId) => setItems((p) => ({ ...p, [inv]: { ...p[inv], [wid]: { ...p[inv][wid], buddyId } } }))
  const toggleFeatured = (wid) => setFeaturedMap((p) => ({ ...p, [inv]: p[inv] === wid ? null : wid }))

  const hideTo = (e, disp) => { e.currentTarget.style.display = 'none'; const s = e.currentTarget.nextElementSibling; if (s) s.style.display = disp }

  const featuredTint = featuredW ? db.skins[active[featuredW.uuid].skinUuid].tint : '#C9BA98'

  // photo/video preview with a centered hover-to-show stop control, shared by the equipped-skin showcase and the confirm popup
  const renderMedia = (skin, photoUrl, st, opts = {}) => {
    const { tab, setTab, vIdx, setVIdx, playing, setPlaying, vRef } = st
    const showVariantPicker = opts.showVariantPicker !== false
    const vids = skin.videos || []                  // index-aligned with chromas; entries may be null
    const hasVid = vids.some((v) => v != null)
    const activeTab = tab === 'video' && hasVid ? 'video' : 'photo'
    // the selected chroma's clip, falling back to the first available one when this chroma has none
    const curVideo = hasVid ? (vids[vIdx] || vids.find((v) => v != null)) : null
    const toggle = () => { const v = vRef.current; if (!v) return; if (v.paused) v.play(); else v.pause() }
    return (
      <div className="mediabox">
        {activeTab === 'video' && curVideo
          ? <video ref={vRef} key={curVideo} src={curVideo} autoPlay loop muted controls={false} playsInline
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onError={() => setTab('photo')} onClick={toggle} />
          : (photoUrl
            ? (<><img src={photoUrl} alt={skin.name} onError={(ev) => hideTo(ev, 'flex')} /><div className="ph" style={{ display: 'none' }}>{skin.name}</div></>)
            : (<div className="ph">{skin.name}</div>))}
        {activeTab === 'video' && curVideo && (
          <button className="wplaybtn" onClick={toggle} title={playing ? 'Zastavit' : 'Přehrát'}>{playing ? '⏸' : '▶'}</button>
        )}
        {hasVid && (
          <div className="wptabs">
            <button className={activeTab === 'photo' ? 'on' : ''} onClick={() => setTab('photo')}>📷 Foto</button>
            <button className={activeTab === 'video' ? 'on' : ''} onClick={() => setTab('video')}>🎬 Video</button>
          </div>
        )}
        {showVariantPicker && activeTab === 'video' && vids.filter((v) => v != null).length > 1 && (
          <div className="wvariants">
            {vids.map((v, i) => v != null && (
              <button key={i} className={i === vIdx ? 'on' : ''} onClick={() => setVIdx(i)}>{i + 1}</button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ---- render helpers (plain functions returning JSX, not nested components) ----
  const renderSlot = (w) => {
    const e = equipOf(w.uuid); const s = db.skins[e.skinUuid]
    const img = skinImageUrl(s, e.chromaIndex, w)
    const buddy = db.buddies.find((b) => b.uuid === e.buddyId)
    const std = s.isStandard
    const isFeat = featuredW && featuredW.uuid === w.uuid
    return (
      <div key={w.uuid} className={'slot' + (std ? ' std' : '')} style={{ '--tint': s.tint, '--w': String(weightFor(w.name)) }} onClick={() => setWeaponTarget(w.uuid)}>
        <span className="sp-tier" />
        <button className={'star' + (isFeat ? ' on' : '')} title="Hlavní kousek" onClick={(ev) => { ev.stopPropagation(); toggleFeatured(w.uuid) }}>★</button>
        <div className="sp-img">
          {img
            ? (<><img src={img} alt={s.name} onError={(ev) => hideTo(ev, 'flex')} /><span className="sp-ph" style={{ display: 'none' }}>{w.name}</span></>)
            : (<span className="sp-ph">{w.name}</span>)}
        </div>
        {buddy && <div className="sp-buddy"><img src={buddy.img} alt="" /></div>}
        <div className="sp-edit"><span>Vybrat skin</span></div>
        <div className="sp-foot">
          <div><div className="sp-name">{std ? w.name : s.name}</div><div className="sp-wpn">{w.name}</div></div>
          <div className="sp-price">{s.price ? fmt(s.price) + ' VP' : '—'}</div>
        </div>
      </div>
    )
  }

  const renderShowcase = () => {
    if (!featuredW) {
      return (
        <div className="empty" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <div><h3>Zatím jen standardy</h3><p>Klikni na zbraň dole a vyber první skin — objeví se tu jako hlavní kousek.</p></div>
        </div>
      )
    }
    const e = equipOf(featuredW.uuid); const s = db.skins[e.skinUuid]; const img = skinImageUrl(s, e.chromaIndex, featuredW)
    return (
      <>
        <div className="showcase">
          <div className="halo" />
          {img
            ? (<><img className="sc-img" src={img} alt={s.name} onError={(ev) => hideTo(ev, 'flex')} /><div className="sc-ph" style={{ display: 'none' }}>{s.name}</div></>)
            : (<div className="sc-ph">{s.name}</div>)}
          <div className="sc-meta">
            {s.tierName && <span className="sc-tier"><i />{s.tierName} edice</span>}
            <h1 className="sc-name">{s.name}</h1>
            <div className="sc-weapon">{s.weapon} · {s.cat}</div>
          </div>
          <div className="sc-price"><div className="k">Cena</div><div className="v">{fmt(s.price)} <small>VP</small></div></div>
        </div>
        <div className="pucks">
          <div className="puck accent p1" data-label="Hodnota inventáře"><span className="ic">💎</span><span className="mini">Hodnota</span><span className="num">{fmt(totals.sum)}</span></div>
          <div className="puck p2" data-label="Počet skinů"><span className="ic">🎯</span><span className="mini">Skiny</span><span className="num">{totals.owned}</span></div>
          <div className="puck p3" data-label="Oskinováno zbraní"><span className="ic">🔫</span><span className="mini">Zbraně</span><span className="num">{totals.owned}/{totals.total}</span></div>
          <div className="puck p4" data-label="Ultra / Exclusive"><span className="ic">👑</span><span className="mini">Top</span><span className="num">{totals.high}</span></div>
          <div className="puck p5" data-label="Cena kousku"><span className="ic">🏷️</span><span className="mini">Cena</span><span className="num">{fmt(s.price)}</span></div>
        </div>
      </>
    )
  }

  const renderWeaponModal = () => {
    const w = db.weapons.find((x) => x.uuid === weaponTarget)
    if (!w) return null
    const e = equipOf(w.uuid); const sel = db.skins[e.skinUuid]; const img = skinImageUrl(sel, e.chromaIndex, w)
    const buddy = db.buddies.find((b) => b.uuid === e.buddyId)
    const allIds = [...w.skinIds].sort((a, b) => { const A = db.skins[a], B = db.skins[b]; if (A.isStandard) return -1; if (B.isStandard) return 1; return B.price - A.price || A.name.localeCompare(B.name) })
    const stdIds = w.skinIds.filter((id) => db.skins[id].isStandard)
    const ownedIds = Array.from(new Set([...(e.owned || []), e.skinUuid, ...stdIds]))
    const pool = browseAll ? allIds : allIds.filter((id) => ownedIds.includes(id))
    const q = skinSearch.trim().toLowerCase()
    const ids = q ? pool.filter((id) => { const s = db.skins[id]; return (s.isStandard ? 'standard' : s.name).toLowerCase().includes(q) }) : pool
    const showChromas = !sel.isStandard && sel.chromas.length > 1
    return (
      <div className="wmodal show" onClick={(ev) => { if (ev.target.classList.contains('wmodal')) setWeaponTarget(null) }}>
        <div className="wpanel" style={{ '--tint': sel.tint }}>
          <div className="wbanner">
            <button className="wclose" onClick={() => setWeaponTarget(null)}>✕</button>
            <div className="wprev">
              <div className="halo" />
              {renderMedia(sel, img, { tab: previewTab, setTab: setPreviewTab, vIdx: e.chromaIndex, setVIdx: (i) => setChroma(w.uuid, i), playing: videoPlaying, setPlaying: setVideoPlaying, vRef: videoRef })}
              {buddy && <div className="wprev-buddy"><img src={buddy.img} alt="" /></div>}
            </div>
            <div className="winfo">
              {sel.tierName
                ? <span className="wtier"><i />{sel.tierName} edice</span>
                : <span className="wtier" style={{ '--tint': '#B7A98A' }}><i />Standard</span>}
              <div className="wwpn">{w.name} · {w.cat}</div>
              <div className="wskin">{sel.name}</div>
              <div className="wprice">{fmt(sel.price)} <small>VP</small></div>
              {showChromas && (
                <div className="wctl">
                  <div className="lab">Varianty</div>
                  <div className="wchromas">
                    {sel.chromas.slice(0, 6).map((c, ci) => (
                      <button key={ci} className={ci === e.chromaIndex ? 'on' : ''} title={c.name}
                        style={{ backgroundImage: `url('${c.swatch}')`, backgroundColor: sel.tint }}
                        onClick={() => setChroma(w.uuid, ci)} />
                    ))}
                  </div>
                </div>
              )}
              <div className="wctl">
                <div className="lab">Přívěšek</div>
                <button className={'wbuddy' + (buddy ? ' has' : '')} onClick={() => setBuddyTarget(w.uuid)}>
                  <span className="slot-i">{buddy ? <img src={buddy.img} alt="" /> : '+'}</span>
                  {buddy ? buddy.name : 'Přidat přívěšek'}
                </button>
              </div>
            </div>
          </div>
          <div className="wchoose">
            <div className="wchoose-head">
              <b>Vyber skin pro {w.name}</b>
              <span className="c">{ids.length}</span>
              <div className="wmodebar">
                <button className={'wbrowse' + (!browseAll ? ' on' : '')} onClick={() => switchMode(false)}>Vlastněné</button>
                <button className={'wbrowse' + (browseAll ? ' on' : '')} onClick={() => switchMode(true)}>+ Přidat skin</button>
              </div>
            </div>
            <div className="wsearch">
              <input type="text" placeholder="Hledat skin…" value={skinSearch} onChange={(ev) => setSkinSearch(ev.target.value)} />
            </div>
            <div className="wgrid">
              {ids.map((id) => {
                const s = db.skins[id]; const pim = s.isStandard ? w.img : (s.img || w.img)
                const isOwned = ownedIds.includes(id)
                const removable = !browseAll && !s.isStandard
                return (
                  <div key={id} className={'pick' + (id === e.skinUuid ? ' on' : '') + (browseAll && !isOwned ? ' addable' : '')} style={{ '--tint': s.tint }} onClick={() => { if (browseAll && isOwned) setSkin(w.uuid, id); else setConfirmAdd(id) }}>
                    <span className="ptag" /><span className="eq">vybráno</span>
                    {browseAll && !isOwned && <span className="addtag">+ přidat</span>}
                    {removable && <button className="pdel" title="Odebrat z vlastněných" onClick={(ev) => { ev.stopPropagation(); removeOwned(w.uuid, id) }}>✕</button>}
                    <div className="pimg">
                      {pim
                        ? (<><img src={pim} alt={s.name} onError={(ev) => hideTo(ev, 'block')} /><span className="pph" style={{ display: 'none' }} /></>)
                        : (<span className="pph" />)}
                    </div>
                    <div className="pn">{s.isStandard ? 'Standard' : s.name}</div>
                    <div className="pw"><span>{s.tierName || 'základní'}</span><b>{s.price ? fmt(s.price) + ' VP' : '—'}</b></div>
                  </div>
                )
              })}
              {ids.length === 0 && <div className="wempty">Žádné skiny nenalezeny</div>}
            </div>
          </div>
        </div>
        {confirmAdd && (() => {
          const cs = db.skins[confirmAdd]
          const cim = cs.isStandard ? w.img : (cs.img || w.img)
          const csOwned = ownedIds.includes(confirmAdd)
          return (
            <div className="caoverlay" onClick={(ev) => { if (ev.target.classList.contains('caoverlay')) setConfirmAdd(null) }}>
              <div className="cabox" style={{ '--tint': cs.tint }}>
                <div className="caimg">
                  {renderMedia(cs, cim, { tab: confirmTab, setTab: setConfirmTab, vIdx: confirmVideoIndex, setVIdx: setConfirmVideoIndex, playing: confirmVideoPlaying, setPlaying: setConfirmVideoPlaying, vRef: confirmVideoRef })}
                </div>
                <div className="caname">{cs.isStandard ? 'Standard' : cs.name}</div>
                <div className="caprice">{cs.price ? fmt(cs.price) + ' VP' : '—'}</div>
                <p className="caq">{csOwned ? 'Vybavit tento skin?' : 'Přidat tento skin do vlastněných a vybavit ho?'}</p>
                <div className="cabtns">
                  <button className="cacancel" onClick={() => setConfirmAdd(null)}>Zrušit</button>
                  <button className="caconfirm" onClick={() => { setSkin(w.uuid, confirmAdd); setConfirmAdd(null) }}>{csOwned ? 'Vybavit' : 'Přidat'}</button>
                </div>
                {csOwned && !cs.isStandard && (
                  <button className="caremove" onClick={() => { removeOwned(w.uuid, confirmAdd); setConfirmAdd(null) }}>Odstranit z inventáře</button>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  const renderBuddyModal = () => (
    <div className="bmodal show" onClick={(ev) => { if (ev.target.classList.contains('bmodal')) setBuddyTarget(null) }}>
      <div className="bpanel">
        <div className="bph"><h3>Vyber přívěšek</h3><button onClick={() => setBuddyTarget(null)}>✕</button></div>
        <div className="bbody">
          {db.buddies.length === 0
            ? <div className="bcell none">Přívěšky se nepodařilo načíst</div>
            : (
              <>
                <div className="bcell none" onClick={() => { setBuddy(buddyTarget, null); setBuddyTarget(null) }}>žádný</div>
                {db.buddies.slice(0, 90).map((b) => (
                  <div key={b.uuid} className="bcell" title={b.name} onClick={() => { setBuddy(buddyTarget, b.uuid); setBuddyTarget(null) }}>
                    <img src={b.img} alt={b.name} onError={(ev) => { ev.currentTarget.parentElement.textContent = b.name.split(' ')[0] }} />
                  </div>
                ))}
              </>
            )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className="wrap">
        <div className="top">
          <div className="brand"><span className="dot" /><span className="logo">STASH</span><span className="sub">tvoje Valorant sbírka</span></div>
          <div className="seg">
            <button className={inv === 'my' ? 'on' : ''} onClick={() => setInv('my')}>Můj inventář</button>
            <button className={inv === 'dream' ? 'on' : ''} onClick={() => setInv('dream')}>Vysněný</button>
          </div>
          <div className="total"><span className="k">Hodnota</span><span className="v">{fmt(totals.sum)} <small>VP</small></span></div>
        </div>

        <section className="hero" style={{ '--tint': featuredTint }}>
          <div className="hero-eyebrow"><span className="pin" /> Hlavní kousek</div>
          <div className="hero-stage">
            {!db
              ? <div className="loading" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>Načítám zbraně z Valorantu…</div>
              : renderShowcase()}
          </div>
        </section>

        <div className="wall-head">
          <h2>{inv === 'my' ? 'Můj inventář' : 'Vysněný inventář'}</h2>
          <span className="count">{totals.owned} {totals.owned === 1 ? 'skin' : 'skinů'}</span>
          <span className="hint">Klikni na zbraň a vyber skin</span>
        </div>

        <div className={'grid' + (multi ? '' : ' auto')} ref={gridRef} style={multi && colH ? { height: colH + 'px' } : undefined}>
          {db && cols.map((col, ci) => (
            <div className="col" key={ci}>
              {col.map(([cat, label]) => {
                const ws = weaponsOf(cat)
                if (!ws.length) return null
                return (
                  <div key={cat} style={{ display: 'contents' }}>
                    <div className="cat">{label}</div>
                    {ws.map(renderSlot)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <p className="note">Ceny jsou orientační VP podle edice skinu · data: valorant-api.com</p>
      </div>

      {db && weaponTarget && renderWeaponModal()}
      {db && buddyTarget !== null && renderBuddyModal()}
    </>
  )
}
