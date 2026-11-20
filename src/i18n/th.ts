/**
 * Thai - the primary game language and the source of truth for translation keys.
 * `en.ts` must provide exactly the same keys (enforced by the `Messages` type and the i18n tests).
 *
 * Placeholders use {name} and are filled by t(key, { name: value }); numbers are never hard-coded.
 * Stat abbreviations (STR, ATK, HP, SP, EXP, Lv ...) are kept in Latin letters on purpose, as is
 * common in Thai RPGs and because the HUD / Status slots are small.
 */
export const th = {
  common: {
    loading: 'กำลังโหลด',
    loadingProgress: 'กำลังโหลด {percent}%',
    confirm: 'ยืนยัน',
    cancel: 'ยกเลิก',
    close: 'ปิด',
    reset: 'รีเซ็ต',
    settings: 'ตั้งค่า',
  },
  language: {
    th: 'ไทย',
    en: 'English',
  },
  settings: {
    title: 'ตั้งค่า',
    /** Shown in both languages on purpose so either reader can find it. */
    languageLabel: 'ภาษา / Language',
  },
  creation: {
    title: 'สร้างตัวละคร',
    subtitle: 'ไมล์สโตน 01 · ต้นแบบ',
    gender: 'เพศ',
    hairstyle: 'ทรงผม',
    outfitPreview: 'ตัวอย่างชุด',
    name: 'ชื่อ',
    namePlaceholder: 'ใส่ชื่อตัวละคร',
    nameHint: '{min}-{max} ตัวอักษรหรือตัวเลข',
    create: 'สร้างตัวละคร',
    preview: 'ตัวอย่าง',
    rotateHint: 'หมุนเพื่อดูครบทั้ง 8 ทิศ',
  },
  direction: {
    N: 'เหนือ',
    NE: 'ตะวันออกเฉียงเหนือ',
    E: 'ตะวันออก',
    SE: 'ตะวันออกเฉียงใต้',
    S: 'ใต้',
    SW: 'ตะวันตกเฉียงใต้',
    W: 'ตะวันตก',
    NW: 'ตะวันตกเฉียงเหนือ',
  },
  validation: {
    nameEmpty: 'กรุณาใส่ชื่อตัวละคร',
    nameTooShort: 'ชื่อต้องมีอย่างน้อย {min} ตัวอักษร',
    nameTooLong: 'ชื่อต้องไม่เกิน {max} ตัวอักษร',
    nameInvalid: 'ใช้ได้เฉพาะตัวอักษร ตัวเลข และเว้นวรรคทีละช่อง',
  },
  appearance: {
    gender: {
      male: 'ชาย',
      female: 'หญิง',
    },
    hairstyle: {
      mohawk: 'โมฮอว์ก',
      side_swept: 'แสกปัด',
      middle_part: 'แสกกลาง',
      slicked_back: 'ปัดหลัง',
      long_middle_part: 'ผมยาวแสกกลาง',
      buzz_cut: 'หัวเกรียน',
      straight_bangs: 'หน้าม้าตรง',
      twin_buns: 'สองมวย',
      bob: 'บ็อบ',
      ponytail: 'หางม้า',
      fluffy_curls: 'ลอนฟู',
      long_side_part: 'ยาวตรงแสกข้าง',
      bald: 'หัวโล้น',
    },
    hairColor: {
      blonde: 'บรอนด์',
      black: 'ดำ',
      silver: 'เงิน/ขาว',
      brown: 'น้ำตาล',
      red: 'แดง',
    },
    outfit: {
      basic: 'แก้ผ้า',
      adventurer: 'ผจญภัย',
      drifter: 'ดริฟเตอร์',
    },
  },
  world: {
    entering: 'กำลังเข้าสู่แผนที่',
    mapLoadFailed: 'โหลดแผนที่ไม่สำเร็จ',
    mapLoadFailedHint: 'กด ESC เพื่อกลับไปหน้าสร้างตัวละคร',
  },
  maps: {
    /** Proper name kept in English until an official Thai name exists (see i18n README notes). */
    ashen_crossroads: 'Ashen Crossroads',
  },
  hud: {
    level: 'Lv {level}',
    hp: 'HP {current}/{max}',
    sp: 'SP {current}/{max}',
    exp: 'EXP {percent}%',
    noActiveQuest: 'ไม่มีเควสที่กำลังทำ',
    auto: 'ออโต้',
    menuStatus: 'สถานะ',
    menuSettings: 'ตั้งค่า',
  },
  status: {
    title: 'สถานะ',
    level: 'Lv {level}',
    statPoints: 'แต้มสเตตัส {points}',
    derivedTitle: 'ค่าสถานะรอง',
    captionCurrent: 'ปัจจุบัน',
    captionPreview: 'ตัวอย่าง',
    summary: 'เลือก {selected}  เหลือ {left}',
    applied: 'เพิ่มแต้มสเตตัสแล้ว',
    devGrant: 'DEV +10',
    stats: {
      str: { label: 'STR', description: 'โจมตีประชิด' },
      dex: { label: 'DEX', description: 'โจมตีระยะไกล, HIT' },
      int: { label: 'INT', description: 'MATK, SP สูงสุด' },
      vit: { label: 'VIT', description: 'HP สูงสุด, DEF, MDEF' },
      agi: { label: 'AGI', description: 'ความเร็วโจมตี, FLEE' },
      luk: { label: 'LUK', description: 'คริติคอล, ดรอปวัตถุดิบ' },
    },
    derived: {
      meleeAtk: 'ATK ประชิด',
      rangedAtk: 'ATK ระยะไกล',
      matk: 'MATK',
      maxHp: 'HP สูงสุด',
      maxSp: 'SP สูงสุด',
      def: 'DEF',
      mdef: 'MDEF',
      hit: 'HIT',
      flee: 'FLEE',
      attackSpeedBonus: 'ความเร็วโจมตี (โบนัส)',
      critRate: 'อัตราคริติคอล',
      critDamage: 'ความแรงคริติคอล',
      materialFindBonus: 'ดรอปวัตถุดิบ (สัมพัทธ์)',
    },
    errors: {
      noPointsSelected: 'ยังไม่ได้เลือกแต้ม',
      invalidPending: 'ค่าที่เลือกของ {stat} ไม่ถูกต้อง',
      exceedsMax: '{stat} ต้องไม่เกิน {max}',
      notEnoughPoints: 'แต้มสเตตัสไม่พอ',
    },
  },
};

export type Messages = typeof th;
