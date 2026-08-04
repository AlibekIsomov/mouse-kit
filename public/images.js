/**
 * Product photos, keyed by "brand::model".
 *
 * Every URL here was verified to return HTTP 200 with an image content-type, and the
 * bytes were decoded and looked at — header checks alone are not enough. Logitech's
 * image-transform URLs answer 200 with a 1 KB placeholder GIF when an asset is
 * missing, so a header-only check would have accepted several dead links.
 *
 * The photos are hotlinked from the vendors' own CDNs: nothing is stored on our
 * server. The cost is that the visitor's browser contacts those CDNs, which is why
 * the footer says so plainly.
 *
 * A model with no entry, or whose image fails to load, falls back to the drawn
 * silhouette below. The frame is the same size either way, so nothing shifts.
 */
export const MODEL_IMAGES = {
  /* --- Logitech — resource.logitech.com, Access-Control-Allow-Origin: * --- */
  "logitech::g102 / g203": "https://resource.logitech.com/content/dam/gaming/en/products/refreshed-g203/2025-update/g203-mouse-top-angle-black-gallery-1.png",
  "logitech::g304 / g305": "https://resource.logitech.com/content/dam/gaming/en/products/g305/2025-update/g305-lightspeed-mouse-top-angle-black-gallery-1.png",
  "logitech::g402": "https://resource.logitech.com/content/dam/gaming/en/products/g402/gallery-5.png",
  "logitech::g502 hero": "https://resource.logitech.com/content/dam/gaming/en/non-braid/hyjal-g502-hero/2025/g502-hero-mouse-top-angle-gallery-1.png",
  "logitech::g502 x": "https://resource.logitech.com/content/dam/gaming/en/products/g502x-corded/gallery/g502x-corded-gallery-1-black.png",
  // 650x388 — the only surviving official G603 asset, smaller than the rest
  "logitech::g603": "https://resource.logitech.com/content/dam/products/gaming/mice/g603-lightspeed-wireless-gaming-mouse/g603-lightspeed-wireless-gaming-mouse11.png",
  "logitech::g703": "https://resource.logitech.com/content/dam/gaming/en/products/g703-hero/2025-update/g703-mouse-top-angle-gallery-1.png",
  "logitech::g pro wireless": "https://resource.logitech.com/content/dam/gaming/en/products/pro-wireless-gaming-mouse/pro-wireless-carbon-gallery-2.png",
  "logitech::g pro x superlight": "https://resource.logitech.com/content/dam/gaming/en/products/pro-x-superlight/pro-x-superlight-black-gallery-6.png",
  "logitech::g pro x superlight 2": "https://resource.logitech.com/content/dam/gaming/en/products/pro-x-superlight-2/new-gallery-assets-2025/pro-x-superlight-2-mice-top-angle-black-gallery-1.png",
  "logitech::g903": "https://resource.logitech.com/content/dam/gaming/en/products/g903-hero/2025-update/g903-lightspeed-mouse-top-angle-gallery-1.png",
  // MX Master has no true top-down render anywhere; this is Logitech's highest angle
  "logitech::mx master 3s": "https://resource.logitech.com/content/dam/logitech/en/products/mice/mx-master-3s/gallery/mx-master-3s-mouse-top-view-graphite.png",
  // the 3S revision; shell is identical to the 3
  "logitech::mx anywhere 3": "https://resource.logitech.com/content/dam/logitech/en/products/mice/mx-anywhere-3s/product-gallery/graphite/mx-anywhere-3s-mouse-top-view-graphite.png",
  "logitech::m720": "https://resource.logitech.com/content/dam/logitech/en/products/mice/m720/gallery/m720-gallery-1a.png",

  /* --- Razer — medias-p1.phoenix.razer.com, no CORS header.
         Fine for <img src>; would fail fetch()/canvas pixel access. --- */
  "razer::deathadder v3": "https://medias-p1.phoenix.razer.com/sys-master-phoenix-images-container/h79/haf/9529652674590/deathadder-v3-2-500x500.png",
  "razer::viper v3 pro": "https://medias-p1.phoenix.razer.com/sys-master-phoenix-images-container/h08/h61/9765618188318/viper-v3-pro-black-500x500.png",
  "razer::basilisk v3": "https://medias-p1.phoenix.razer.com/sys-master-phoenix-images-container/he4/h63/9822107926558/basilisk-v3-35k-2-500x500.png",
  "razer::naga v2 pro": "https://medias-p1.phoenix.razer.com/sys-master-phoenix-images-container/hb2/hb9/9529652379678/naga-v2-pro-2-500x500.png",
  "razer::naga v2 hyperspeed": "https://medias-p1.phoenix.razer.com/sys-master-phoenix-images-container/h68/hac/9529652740126/naga-v2-hyperspeed-2-500x500.png",
  "razer::cobra": "https://medias-p1.phoenix.razer.com/sys-master-phoenix-images-container/h54/h60/9591466950686/cobra-500x500.png",
  "razer::orochi v2": "https://medias-p1.phoenix.razer.com/sys-master-phoenix-images-container/h63/h8c/10078843797534/orochi-v2-2026-black-2-500x500.png",

  /* --- VXE — ATK's CDN, /device/ossAssets/ paths are unhashed and durable.
         The vendor's own software reuses one render across a family, so the SE/Pro
         variants deliberately point at the same file. --- */
  "vxe::r1": "https://bpcdn.atkgear.com/device/ossAssets/r1/black.webp",
  "vxe::r1 se": "https://bpcdn.atkgear.com/device/ossAssets/r1/black.webp",
  "vxe::r1 pro": "https://bpcdn.atkgear.com/device/ossAssets/r1/black.webp",
  "vxe::r1s": "https://bpcdn.atkgear.com/device/ossAssets/r1/black.webp",
  "vxe::r1s+": "https://bpcdn.atkgear.com/device/ossAssets/r1/black.webp",
  "vxe::r2": "https://bpcdn.atkgear.com/device/ossAssets/r2/black.webp",
  "vxe::r2 se": "https://bpcdn.atkgear.com/device/ossAssets/r2/black.webp",
  "vxe::v3": "https://bpcdn.atkgear.com/device/ossAssets/v3/black.webp",
  "vxe::v3 nk": "https://bpcdn.atkgear.com/device/ossAssets/v3/black.webp",
  "vxe::x3": "https://bpcdn.atkgear.com/device/ossAssets/x3/black.webp",
  // build-hashed path, pinned to hub 3.2.16 — will break if that release is purged
  "vxe::mad r": "https://bpcdn.atkgear.com/hub-v3/production/3.2.16/static/black-DCbDiXsF.webp",

  /* --- VGN — all build-hashed, same caveat as Mad R.
         The shared F1 render carries ATK's star logo rather than VGN's dragonfly;
         only the Moba file has the real VGN logo. --- */
  "vgn::f1 pro": "https://bpcdn.atkgear.com/hub-v3/production/3.2.16/static/black-D-g07huf.webp",
  "vgn::f1 pro max": "https://bpcdn.atkgear.com/hub-v3/production/3.2.16/static/black-D-g07huf.webp",
  "vgn::dragonfly f1": "https://bpcdn.atkgear.com/hub-v3/production/3.2.16/static/black-D-g07huf.webp",
  "vgn::dragonfly f1 moba": "https://bpcdn.atkgear.com/hub-v3/production/3.2.16/static/dan-zi-B-GJdHg1.webp",

  /* --- Darmoshark — darmoshark.cc is a Chinese origin with no edge cache
         (max-age=0), so these load noticeably slower than the rest. --- */
  "darmoshark::m3": "https://www.darmoshark.cc/api/upload/cover/27/1737451181231.png",
  "darmoshark::m3s": "https://www.darmoshark.cc/api/upload/cover/27/1739160730899.png",
  "darmoshark::m5": "https://www.darmoshark.cc/api/upload/cover/27/1740984797644.png",
  "darmoshark::n3": "https://cdn.shopify.com/s/files/1/0647/6319/9593/files/12_f639a1df-1a8b-4817-9541-50ffb1673e43.jpg?width=800",

  /* --- Ajazz --- */
  "ajazz::aj199": "https://cdn.shopify.com/s/files/1/0704/7210/6227/files/9_8f8c439e-7b4e-42af-a65f-67633b503859.png?width=800",
  "ajazz::aj139": "https://cdn.shopify.com/s/files/1/0704/7210/6227/files/b8421501ceee8ed8defa49d79fc692df_e2a2d931-ecf2-4c26-ad58-6d84d38cb480.jpg?width=800",
  "ajazz::aj159": "https://cdn.shopify.com/s/files/1/0704/7210/6227/files/01.jpg?width=800",

  /* --- Machenike — the base M7 has no top-down shot, so the M7 Pro render is used --- */
  "machenike::m7": "https://cdn.shopify.com/s/files/1/0576/4110/7626/files/010090.jpg?width=800",
  "machenike::m6": "https://cdn.shopify.com/s/files/1/0576/4110/7626/products/5_3fb22342-8883-4dc2-aa67-db29a984bc26.png?width=800",
  "machenike::m8": "https://cdn.shopify.com/s/files/1/0576/4110/7626/products/M8_-1.png?width=800",

  /* --- Lamzu — Maya X and Inca are newer and have no transparent cutout;
         theirs are a slight tilt on black rather than a true top-down. --- */
  "lamzu::atlantis": "https://cdn.shopify.com/s/files/1/0581/9675/4466/files/productColor_V2_pro_white.png?width=800",
  "lamzu::atlantis mini": "https://cdn.shopify.com/s/files/1/0581/9675/4466/files/productColor_mini_white.png?width=800",
  "lamzu::maya": "https://cdn.shopify.com/s/files/1/0581/9675/4466/files/productColor_maya_black.png?width=800",
  "lamzu::maya x": "https://cdn.shopify.com/s/files/1/0581/9675/4466/files/MayaX8K_800X800_1-763639.png?width=800",
  "lamzu::thorn": "https://cdn.shopify.com/s/files/1/0581/9675/4466/files/productColor_thorn.png?width=800",
  "lamzu::inca": "https://cdn.shopify.com/s/files/1/0581/9675/4466/files/INCA_800X800_3.jpg?width=800",

  /* --- ATK — all on the unversioned /device/ossAssets/ path, so nothing here breaks
         on a hub release. ATK ships one render per family, not per SKU: the nine A9
         variants share a picture in ATK's own software too. --- */
  "atk::a9": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 se": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 plus": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 pro": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 pro max": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 ultra": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 ultra max 2.0": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 ultimate": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 air": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 mini": "https://bpcdn.atkgear.com/device/ossAssets/a9nearlink/white.webp",
  "atk::a9 x": "https://bpcdn.atkgear.com/device/ossAssets/a9/a9-x-white.webp",
  "atk::u2 se": "https://bpcdn.atkgear.com/device/ossAssets/u2/white.webp",
  "atk::u2 plus": "https://bpcdn.atkgear.com/device/ossAssets/u2/white.webp",
  "atk::y9 se": "https://bpcdn.atkgear.com/device/ossAssets/y9/white.webp",
  "atk::y9 plus": "https://bpcdn.atkgear.com/device/ossAssets/y9/white.webp",
  "atk::x1": "https://bpcdn.atkgear.com/device/ossAssets/x1/white.webp",
  "atk::x1 lite": "https://bpcdn.atkgear.com/device/ossAssets/x1/white.webp",
  "atk::x1 s": "https://bpcdn.atkgear.com/device/ossAssets/x1/white.webp",
  "atk::f1": "https://bpcdn.atkgear.com/device/ossAssets/f1/sky-f1-v2-white.webp",
  "atk::f1 pro max": "https://bpcdn.atkgear.com/device/ossAssets/f1/sky-f1-v2-white.webp",

  /* --- Attack Shark — the official store on Shopify. Several shots include the
         charging dock, dongle or cable beside the mouse; the mouse itself is still
         dead-on top-down on white. --- */
  "attack shark::x11": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/1_c71b0db8-b72f-48c8-ada5-bc584785ef1e.jpg?width=800",
  "attack shark::x11 pro": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/5_98f678c5-5c8b-49cf-9998-b1ddb31edd18.jpg?width=800",
  "attack shark::x11 se": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/X11SE_2.png?width=800",
  "attack shark::x1": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/X1_3_ce7e8143-8241-4e02-b881-65faace74e4c.png?width=800",
  "attack shark::x3": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/attackshark_x3_gaming_mouse_0005.jpg?width=800",
  "attack shark::x3 pro": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/X3PRO_3.png?width=800",
  "attack shark::x3 max": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/X3MAX_3.png?width=800",
  "attack shark::x6": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/X6_3.png?width=800",
  "attack shark::x8 se": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/X8_2_fc2a39d6-279f-48ca-aa6f-19e08fb4aecd.png?width=800",
  "attack shark::x8 plus": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/X8PLUS_C06_1.png?width=800",
  "attack shark::x8 pro": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/X8PRO_C06ULTRA_1.png?width=800",
  "attack shark::r1": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/R1_3.png?width=800",
  "attack shark::r11": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/R11ULTRA_1.png?width=800",
  "attack shark::r11 ultra": "https://cdn.shopify.com/s/files/1/0823/5050/6282/files/R11ULTRA_1.png?width=800",

  /* --- Glorious — the originals are delisted, so these are the current shells:
         Model O Classic Wireless, Model D 3, Model I 2. --- */
  "glorious::model o": "https://www.gloriousgaming.com/cdn/shop/files/GLO-OC-WL-BLK_Web_Gallery_2_Top_2x_c24029b4-72ca-40a6-8abe-9fb4aa5af6ac.webp?width=800",
  "glorious::model d": "https://www.gloriousgaming.com/cdn/shop/files/GLO-D3-W-BLK_Web_Gallery_Top_2x_c6d005f5-2dda-4c1b-9e24-3ef8cadafd02.webp?width=800",
  "glorious::model i": "https://www.gloriousgaming.com/cdn/shop/files/GLO-MS-IV2-W-BLK_Web_Gallery_Top.webp?width=800",

  /* --- Redragon — M908 has the weight cartridge in frame --- */
  "redragon::m711 cobra": "https://cdn.shopify.com/s/files/1/0012/4957/4961/files/M711wiredgamingmouse.png?width=800",
  "redragon::m908 impact": "https://cdn.shopify.com/s/files/1/0012/4957/4961/files/RedragonImpactM908RGBMMOLaserWiredGamingMouse_1.png?width=800",
  "redragon::m810 pro": "https://cdn.shopify.com/s/files/1/0012/4957/4961/files/TAIPANPROM810PROWirelessGamingMouse_1.png?width=800",

  /* --- Pulsar — X2 / X2V2 / Xlite carry a faint grey size watermark --- */
  "pulsar::x2": "https://cdn.shopify.com/s/files/1/0455/0914/8840/files/X2_v1_Gaming_Mouse_black.png?width=800",
  "pulsar::x2v2": "https://cdn.shopify.com/s/files/1/0455/0914/8840/files/X2_v2_Wireless_Mouse_Medium_Black_001.png?width=800",
  "pulsar::xlite v3": "https://cdn.shopify.com/s/files/1/0455/0914/8840/products/PulsarXliteV3MediumGamingMouse_Black_001-292582.png?width=800",
  "pulsar::feinmann f01": "https://cdn.shopify.com/s/files/1/0455/0914/8840/files/Feinmann-F01-First-Edition_001.png?width=800",

  /* --- SteelSeries — Rival 3 is the Wireless shell; Prime Wireless is the only
         top-down that exists for it and is rotated 90° with dimension callouts. --- */
  "steelseries::rival 3": "https://images.ctfassets.net/w5r1fvmogo3f/5wg6rTva9Gcino4oGrzkrU/bed15453f509fc427607aaff2813b16e/rival3wl_pdp_ergonomicshape_img.jpg",
  "steelseries::rival 600": "https://images.ctfassets.net/hmm5mo4qf4mf/40YXOfd920tkMqbv4fdUin/ef3f925af8f9144d848c4392d25c0b3a/05_rival600_kv_top_hero.png__1920x1080_crop-fit_optimize_subsampling-2-859.png",
  "steelseries::aerox 3": "https://images.ctfassets.net/hmm5mo4qf4mf/39zqWz1yUuuYBkETjPuYPy/ce8d248f7f33b901dcfb984dcf06e451/b6588642852b45dba32447ae82aee21f-2471.png",
  "steelseries::aerox 5": "https://images.ctfassets.net/hmm5mo4qf4mf/11wghlxSQBUulaPG6450Z5/2c231e1df845f14a611c88109c22154e/4fc6959164d24b90a5ba63deb22bc5c3-899.png",
  "steelseries::prime wireless": "https://media.steelseriescdn.com/filer_public/9f/3a/9f3a575f-ea72-432e-9476-6b98c38617b7/carousel_prime_wl_dimensions_top.png",

  /* --- Corsair — Cloudinary transform already caps these at 1100px --- */
  "corsair::m65 rgb ultra": "https://assets.corsair.com/image/upload/c_pad,q_85,h_1100,w_1100,f_auto/products/Gaming-Mice/base-m65-rgb-ultra-2-config/Gallery/M65_RGB_ULTRA_01.webp",
  "corsair::sabre rgb pro": "https://assets.corsair.com/image/upload/c_pad,q_85,h_1100,w_1100,f_auto/products/Gaming-Mice/base-sabre-rgb-pro-champion/Gallery/CH-9303111_01.webp",
  "corsair::katar pro": "https://assets.corsair.com/image/upload/c_pad,q_85,h_1100,w_1100,f_auto/products/Gaming-Mice/base-katar-pro-config/Gallery/KATAR_PRO_WIRED_01.webp",
  "corsair::darkstar": "https://assets.corsair.com/image/upload/c_pad,q_85,h_1100,w_1100,f_auto/products/Gaming-Mice/CH-931A011/DARKSTAR_WIRELESS_01.webp",

  /* --- ROCCAT (Turtle Beach store) --- */
  "roccat::kone pro": "https://cdn.shopify.com/s/files/1/0556/5795/5430/files/ROCCAT-KonePro-BLK.png?width=800",
  "roccat::kone xp": "https://cdn.shopify.com/s/files/1/0556/5795/5430/files/ROCCAT-Kone-XP-BLK.png?width=800",
  "roccat::burst pro": "https://cdn.shopify.com/s/files/1/0556/5795/5430/files/ROCCAT-BurstPro-BLK.png?width=800",

  /* --- Cooler Master --- */
  "cooler master::mm711": "https://a.storyblok.com/f/281110/51ec79848e/mm711-black-matte-gallery-2.png",
  "cooler master::mm720": "https://www.coolermaster.com/on/demandware.static/-/Sites-cooler-master-main/default/dwb1595526/Assets/mm720/large/mm720-black-matte-2.png",
  "cooler master::mm712": "https://a.storyblok.com/f/281110/204e9bb5cf/mm712-black-gallery-2.png",

  /* --- ASUS ROG — Gladius III and Harpe Ace include award badges in frame --- */
  "asus rog::gladius iii": "https://dlcdnwebimgs.asus.com/gain/56F8A13F-F1E2-4033-A216-5BAC89D0A205",
  "asus rog::keris wireless": "https://dlcdnwebimgs.asus.com/gain/07CE8835-80CB-4A20-818C-9FFDAB0367CA",
  "asus rog::harpe ace": "https://dlcdnwebimgs.asus.com/gain/0F9B888C-4649-4829-B3C9-BDD8734907A4",

  /* --- HyperX — Pulsefire Haste is the Wireless shell; the wired one is delisted --- */
  "hyperx::pulsefire haste": "https://cdn.shopify.com/s/files/1/0564/3612/9997/files/hyperx_pulsefire_haste_wireless_black_1_top_down.jpg?width=800",
  "hyperx::pulsefire haste 2": "https://cdn.shopify.com/s/files/1/0561/8345/5901/files/hyperx_pulsefire_haste_2_black_1_main.jpg?width=800",

  /* --- Endgame Gear --- */
  "endgame gear::xm1r": "https://img.endgamegear.com/products/xm1r/black/GAMO-941-pdp_01.png",
  "endgame gear::op1 8k": "https://cdn.shopify.com/s/files/1/0698/4538/5436/files/OP1_Black_top_down.jpg?width=800",
  "endgame gear::xm2we": "https://img.endgamegear.com/products/xm2we/black/Endgame-Gear-XM2we-Black_4.png",

  /* --- Xtrfy (CHERRY) — 340x340, the only clean top-down assets CHERRY publishes --- */
  "xtrfy::m4": "https://cherryxtrfy.com/wp/wp-content/uploads/2020/06/Xtrfy-M4-Black-Category_2022.png",
  "xtrfy::m42": "https://cherryxtrfy.com/wp/wp-content/uploads/2022/01/Xtrfy-M42-black-Wireless-Category_2022.png",
  "xtrfy::mz1": "https://cherryxtrfy.com/wp/wp-content/uploads/2022/03/Xtrfy-MZ1W-Black-Category_2022.png",

  /* --- Zowie (BenQ) — no cache-control, only a ~24h Expires, so these refetch often --- */
  "zowie::ec2-c": "https://image.benq.com/is/image/benqco/01-ec2-c-top-202501?$ResponsivePreset$&fmt=png-alpha&wid=1200",
  "zowie::fk1-b": "https://image.benq.com/is/image/benqco/01-fk1-b-fk-black-top?$ResponsivePreset$&fmt=png-alpha&wid=1200",
  "zowie::s2": "https://image.benq.com/is/image/benqco/01_s2-top-1?$ResponsivePreset$&fmt=png-alpha&wid=1200",

  /* --- A4Tech Bloody --- */
  "a4tech::w60 max": "https://img.bloody.com/en/uploadfile/image/20210702/20210702092702_25523.jpg",
};

/**
 * Hosts MODEL_IMAGES points at. The page's Content-Security-Policy allows exactly
 * these for img-src and nothing else, so adding a brand means adding its host in
 * three places: here, the meta tag in index.html, and SECURITY_HEADERS in server.js.
 */
export const IMAGE_HOSTS = [
  "https://resource.logitech.com",
  "https://medias-p1.phoenix.razer.com",
  "https://bpcdn.atkgear.com",
  "https://cdn.shopify.com",
  "https://www.darmoshark.cc",
  "https://www.gloriousgaming.com",
  "https://images.ctfassets.net",
  "https://media.steelseriescdn.com",
  "https://assets.corsair.com",
  "https://a.storyblok.com",
  "https://www.coolermaster.com",
  "https://dlcdnwebimgs.asus.com",
  "https://img.endgamegear.com",
  "https://cherryxtrfy.com",
  "https://image.benq.com",
  "https://img.bloody.com",
];

const normalise = s => String(s).toLowerCase().replace(/\s+/g, " ").trim();

/**
 * A brand badge drawn from the brand's own initials.
 *
 * Real vendor logos come in every aspect ratio going, would each need another CSP
 * host, and several brands here publish none that is hotlinkable at all. Initials
 * give every brand an identical 34x34 badge with no request and no licence question.
 */
export function brandBadge(name) {
  const words = String(name).replace(/\(.*?\)/g, "").split(/[\s/]+/).filter(Boolean);
  const initials = words.length > 1
    ? (words[0][0] + words[1][0])
    : words[0].slice(0, 2);

  const BRAND_HUES = {
    "logitech / logitech g": 195,
    "logitech": 195,
    "razer": 135,
    "attack shark": 345,
    "atk": 25,
    "vxe": 270,
    "vgn": 175,
    "darmoshark": 10,
    "lamzu": 210,
    "glorious": 45,
    "pulsar": 285,
    "steelseries": 20,
    "corsair": 50,
    "roccat": 190,
    "asus rog": 350,
  };

  const key = String(name).toLowerCase().trim();
  let hue = BRAND_HUES[key];

  if (hue === undefined) {
    let hash = 0;
    for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    hue = hash % 360;
  }

  return { initials: initials.toUpperCase(), colour: `hsl(${hue} 42% 52%)` };
}

/**
 * Image URL for a model, or null when we have nothing verified.
 * Brand names in devices.js may be compound ("Logitech / Logitech G"), so the first
 * segment is tried as well — that keeps the keys above short.
 */
export function imageFor(brand, model) {
  const m = normalise(model);
  for (const b of [normalise(brand), normalise(String(brand).split("/")[0])]) {
    const hit = MODEL_IMAGES[`${b}::${m}`];
    if (hit) return hit;

    // Fallback partial match (e.g. "r11" matches "r11 ultra" or vice versa)
    for (const [key, url] of Object.entries(MODEL_IMAGES)) {
      const [kb, km] = key.split("::");
      if (kb === b && (km.startsWith(m) || m.startsWith(km) || km.includes(m) || m.includes(km))) {
        return url;
      }
    }
  }
  return null;
}

/**
 * Top-down mouse silhouette used whenever there is no photo.
 * Inline SVG: no request, no CSP host, never 404s, and it inherits the text colour
 * so it can be tinted per brand status.
 */
export const MOUSE_SVG = `
<svg viewBox="0 0 64 96" fill="none" aria-hidden="true">
  <path d="M32 3C17 3 7 16 7 34v28c0 17 11 31 25 31s25-14 25-31V34C57 16 47 3 32 3Z"
        fill="currentColor" opacity=".12"/>
  <path d="M32 3C17 3 7 16 7 34v28c0 17 11 31 25 31s25-14 25-31V34C57 16 47 3 32 3Z"
        stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M32 4v30" stroke="currentColor" stroke-width="2"/>
  <rect x="27.5" y="13" width="9" height="17" rx="4.5" stroke="currentColor" stroke-width="2"/>
</svg>`;
