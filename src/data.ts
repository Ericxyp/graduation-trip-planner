import type { AppState, DestId, Member, MemberId, Scheme } from './types'
export { BUDGET_OPTIONS, MUST_OPTIONS, NO_OPTIONS, PACE_LABEL, PACE_OPTIONS, STAY_OPTIONS } from './shared/options'

export const TRIP = {
  name: '2027届毕业旅行',
  organizer: '小林',
  from: '上海',
  candidates: ['成都', '青岛', '长沙'],
  rangeStart: '2027-06-18',
  rangeEnd: '2027-06-24',
  inviteCode: 'GRAD27',
  total: 8,
}

export const MEMBERS: Member[] = [
  { id: 'lin', name: '小林', school: '新闻传播学院', color: '#FF6B4A', isOrganizer: true, filledAt: '6月2日' },
  { id: 'zhe', name: '阿哲', school: '计算机学院', color: '#3D97D6', filledAt: '6月2日' },
  { id: 'tang', name: '糖糖', school: '外国语学院', color: '#E0A43A', filledAt: '6月3日' },
  { id: 'peng', name: '大鹏', school: '机械工程学院', color: '#5E9F7A', filledAt: '6月3日' },
  { id: 'lu', name: '小鹿', school: '设计学院', color: '#B86FB0', filledAt: '6月4日' },
  { id: 'yiyi', name: '一一', school: '经济学院', color: '#E07A6A', filledAt: '6月4日' },
  { id: 'k', name: '老K', school: '法学院', color: '#4E5A7A', filledAt: '6月5日' },
  { id: 'me', name: '周周', school: '数学科学学院', color: '#2A9D8F', isMe: true },
]

export const memberById = (id: MemberId) => MEMBERS.find((m) => m.id === id)!

export const DATE_OPTIONS = ['2027-06-18', '2027-06-19', '2027-06-20', '2027-06-21', '2027-06-22', '2027-06-23', '2027-06-24']

export const DEST_OPTIONS: { id: DestId; name: string; desc: string }[] = [
  { id: 'chengdu', name: '成都', desc: '火锅、熊猫与慢生活' },
  { id: 'qingdao', name: '青岛', desc: '海边日出与啤酒' },
  { id: 'changsha', name: '长沙', desc: '夜宵、岳麓山与橘子洲' },
]



const DESTS_ALL: Record<DestId, string> = { chengdu: '成都', qingdao: '青岛', changsha: '长沙' }
export const destName = (d: DestId) => DESTS_ALL[d]

export const SCHEMES: Scheme[] = [
  {
    id: 'consensus',
    label: '最大共识',
    slogan: '让最多的人一起出发',
    dest: 'chengdu',
    city: '成都',
    cityCode: 'CTU',
    start: '2027-06-20',
    end: '2027-06-23',
    baseParticipants: ['lin', 'zhe', 'tang', 'peng', 'lu', 'yiyi', 'k'],
    budgetFit: ['lin', 'zhe', 'tang', 'peng', 'lu', 'yiyi'],
    stayMiss: ['tang'],
    topChoice: ['lin', 'zhe', 'peng', 'lu', 'k'],
    matchBase: 92,
    pace: 'balanced',
    stayLabel: '玉林路整租民宿 ×2（4人+3人）',
    stayOk: ['any', 'homestay'],
    tags: ['日期全员可行', '美食密度高', '节奏适中'],
    conflicts: [
      { title: '住宿偏好', detail: '1位同学希望独立卫浴，民宿为两人共用一个卫生间', level: 'mid' },
      { title: '预算边界', detail: '1位同学预算上限为¥2500，超出约¥180', level: 'low' },
    ],
    reasons: [
      '5位同学把成都排在第一位，是目的地偏好里的最大公约数',
      '6月20日—6月23日是全部已填写成员的共同空档',
      '高铁直达约7.5小时，也有航班可选，出行方式灵活',
    ],
    aiTip: {
      headline: '如果把出发时间从6月18日调整到6月20日，可以多加入2位同学，预计人均增加120元。',
      before: '6月18日出发 · 5/8人 · 人均¥2560',
      after: '6月20日出发 · 7/8人 · 人均¥2680',
      status: '已应用到当前方案',
    },
    costs: [
      { key: 'transport', label: '往返交通', note: '上海虹桥—成都东 高铁二等座往返', personal: 1100, shared: 0 },
      { key: 'stay', label: '住宿', note: '整租民宿2套 × 3晚', personal: 0, shared: 4340 },
      { key: 'food', label: '餐饮', note: '日常三餐 + 欢迎聚餐/毕业晚宴', personal: 300, shared: 1260 },
      { key: 'ticket', label: '门票/活动', note: '熊猫基地门票 + 毕业跟拍', personal: 200, shared: 420 },
      { key: 'local', label: '公共交通', note: '地铁 + 拼车往返景点', personal: 0, shared: 630 },
      { key: 'reserve', label: '备用金', note: '每人预留，行程结束多退少补', personal: 130, shared: 0 },
    ],
    itinerary: [
      {
        title: '抵达 · 入住 · 欢迎聚餐',
        items: [
          { time: '08:30', place: '上海虹桥站 → 成都东站', activity: '高铁集合出发，统一购票、车上分组', cost: 0, owner: 'lin' },
          { time: '16:30', place: '玉林路民宿', activity: '办理入住，分配房间与钥匙', cost: 0, owner: 'yiyi' },
          { time: '19:00', place: '春熙路 · 老火锅', activity: '欢迎聚餐，确认明后两天分工', cost: 90, owner: 'peng' },
        ],
      },
      {
        title: '城市体验',
        items: [
          { time: '08:00', place: '成都大熊猫繁育研究基地', activity: '早场看熊猫，人少更好拍', cost: 55, owner: 'lu' },
          { time: '13:30', place: '人民公园 · 鹤鸣茶社', activity: '盖碗茶、掏耳朵，午后放空', cost: 35, owner: 'tang' },
          { time: '19:30', place: '九眼桥 · 锦江夜游', activity: '夜游锦江，吃一轮串串', cost: 70, owner: 'zhe' },
        ],
      },
      {
        title: '毕业纪念活动',
        items: [
          { time: '09:30', place: '四川大学望江校区', activity: '穿学士服拍毕业合影，跟拍师全程', cost: 60, owner: 'lu' },
          { time: '15:00', place: '东郊记忆', activity: '手作毕业纪念册，写给一年后的彼此', cost: 40, owner: 'tang' },
          { time: '19:00', place: '玉林路小酒馆', activity: '毕业晚宴 + 时光信封封存仪式', cost: 110, owner: 'lin' },
        ],
      },
      {
        title: '自由活动 · 返程',
        items: [
          { time: '10:00', place: '太古里 / 文殊院', activity: '分组自由活动，12:30前回民宿', cost: 0, owner: 'k' },
          { time: '13:00', place: '玉林路民宿', activity: '退房，检查物品，结算公共开销', cost: 0, owner: 'yiyi' },
          { time: '16:20', place: '成都东站 → 上海虹桥站', activity: '返程，到家后群里报平安', cost: 0, owner: 'lin' },
        ],
      },
    ],
  },
  {
    id: 'budget',
    label: '最省钱',
    slogan: '把钱花在刀刃上',
    dest: 'changsha',
    city: '长沙',
    cityCode: 'CSX',
    start: '2027-06-21',
    end: '2027-06-24',
    baseParticipants: ['lin', 'zhe', 'peng', 'lu', 'yiyi', 'k'],
    budgetFit: ['lin', 'zhe', 'tang', 'peng', 'lu', 'yiyi', 'k'],
    stayMiss: [],
    topChoice: [],
    matchBase: 84,
    pace: 'balanced',
    stayLabel: '五一广场连锁酒店 · 双床房 ×3',
    stayOk: ['any', 'hotel', 'private-bath'],
    tags: ['全员预算内', '高铁4.5小时', '夜生活丰富'],
    conflicts: [
      { title: '日期冲突', detail: '1位同学6月24日需入职报到，无法参加完整行程', level: 'high' },
      { title: '天气风险', detail: '6月下旬长沙午后常超35°C，2位同学明确不接受暴晒', level: 'mid' },
    ],
    reasons: [
      '人均¥1980，是三个方案中唯一让所有人都在预算内的选择',
      '高铁单程约4.5小时，交通费比成都少近一半',
      '景点多为免费或低价，夜宵和夜景性价比高',
    ],
    aiTip: {
      headline: '如果把行程缩短为6月21日—6月23日，可以多加入1位同学，人均还能再省约160元。',
      before: '4天3晚 · 6/8人 · 人均¥1980',
      after: '3天2晚 · 7/8人 · 人均约¥1820',
      status: '可作为备选，需发起人确认',
    },
    costs: [
      { key: 'transport', label: '往返交通', note: '上海虹桥—长沙南 高铁二等座往返', personal: 620, shared: 0 },
      { key: 'stay', label: '住宿', note: '连锁酒店双床房3间 × 3晚', personal: 0, shared: 3240 },
      { key: 'food', label: '餐饮', note: '日常三餐 + 欢迎聚餐/毕业晚宴', personal: 260, shared: 720 },
      { key: 'ticket', label: '门票/活动', note: '岳麓山观光车 + 毕业跟拍', personal: 120, shared: 300 },
      { key: 'local', label: '公共交通', note: '地铁 + 打车', personal: 0, shared: 420 },
      { key: 'reserve', label: '备用金', note: '每人预留，行程结束多退少补', personal: 200, shared: 0 },
    ],
    itinerary: [
      {
        title: '抵达 · 入住 · 欢迎聚餐',
        items: [
          { time: '09:10', place: '上海虹桥站 → 长沙南站', activity: '高铁集合出发，统一购票', cost: 0, owner: 'lin' },
          { time: '15:00', place: '五一广场酒店', activity: '办理入住，分配房间', cost: 0, owner: 'yiyi' },
          { time: '18:30', place: '超级文和友', activity: '欢迎聚餐，口味虾+糖油粑粑', cost: 75, owner: 'peng' },
        ],
      },
      {
        title: '城市体验',
        items: [
          { time: '08:30', place: '岳麓山 · 爱晚亭', activity: '趁凉爽上山，坐观光车下山', cost: 40, owner: 'zhe' },
          { time: '14:00', place: '湖南博物院', activity: '看马王堆展，室内避暑', cost: 0, owner: 'lu' },
          { time: '20:00', place: '橘子洲头', activity: '江边夜景与青年毛泽东雕像', cost: 15, owner: 'k' },
        ],
      },
      {
        title: '毕业纪念活动',
        items: [
          { time: '09:00', place: '岳麓书院', activity: '书院前拍毕业合影，跟拍师全程', cost: 50, owner: 'lu' },
          { time: '15:00', place: '谢子龙影像艺术馆', activity: '拍一组胶片风毕业照', cost: 30, owner: 'zhe' },
          { time: '19:00', place: '坡子街', activity: '毕业晚宴 + 时光信封封存仪式', cost: 80, owner: 'lin' },
        ],
      },
      {
        title: '自由活动 · 返程',
        items: [
          { time: '10:00', place: '太平老街', activity: '分组自由活动，买伴手礼', cost: 0, owner: 'peng' },
          { time: '12:30', place: '五一广场酒店', activity: '退房，结算公共开销', cost: 0, owner: 'yiyi' },
          { time: '15:40', place: '长沙南站 → 上海虹桥站', activity: '返程，到家后群里报平安', cost: 0, owner: 'lin' },
        ],
      },
    ],
  },
  {
    id: 'memorable',
    label: '最难忘',
    slogan: '把毕业留在海边',
    dest: 'qingdao',
    city: '青岛',
    cityCode: 'TAO',
    start: '2027-06-18',
    end: '2027-06-21',
    baseParticipants: ['lin', 'tang', 'peng', 'lu', 'yiyi'],
    budgetFit: ['tang', 'lu', 'yiyi'],
    stayMiss: [],
    topChoice: ['tang', 'yiyi'],
    matchBase: 78,
    pace: 'relax',
    stayLabel: '八大关海景民宿 · 独立卫浴',
    stayOk: ['any', 'homestay', 'private-bath'],
    tags: ['海边日出毕业照', '帆船出海', '度假节奏'],
    conflicts: [
      { title: '日期冲突', detail: '2位同学6月19日需回校办离校手续，无法6月18日出发', level: 'high' },
      { title: '预算超出', detail: '人均¥3360，超出2位参加成员的预算上限', level: 'high' },
    ],
    reasons: [
      '海边日出合影与帆船出海，是三个方案里纪念感最强的组合',
      '6月中旬青岛平均气温约22°C，避开暑期客流高峰',
      '海景民宿带独立卫浴，满足全部参加成员的住宿要求',
    ],
    aiTip: {
      headline: '如果把出发时间改为6月20日，可以多加入2位同学，但帆船档期紧张，人均预计增加约210元。',
      before: '6月18日出发 · 5/8人 · 人均¥3360',
      after: '6月20日出发 · 7/8人 · 人均约¥3570',
      status: '可作为备选，需发起人确认',
    },
    costs: [
      { key: 'transport', label: '往返交通', note: '上海浦东—青岛胶东 经济舱往返', personal: 1180, shared: 0 },
      { key: 'stay', label: '住宿', note: '海景民宿整套 × 3晚', personal: 0, shared: 4500 },
      { key: 'food', label: '餐饮', note: '日常三餐 + 海鲜欢迎宴/毕业晚宴', personal: 360, shared: 600 },
      { key: 'ticket', label: '门票/活动', note: '帆船出海包船 + 日出毕业跟拍', personal: 280, shared: 1200 },
      { key: 'local', label: '公共交通', note: '机场往返包车 + 打车', personal: 0, shared: 400 },
      { key: 'reserve', label: '备用金', note: '每人预留，行程结束多退少补', personal: 200, shared: 0 },
    ],
    itinerary: [
      {
        title: '抵达 · 入住 · 欢迎聚餐',
        items: [
          { time: '09:20', place: '上海浦东 → 青岛胶东机场', activity: '航班集合出发，统一值机', cost: 0, owner: 'lin' },
          { time: '14:30', place: '八大关海景民宿', activity: '办理入住，分配房间', cost: 0, owner: 'yiyi' },
          { time: '18:30', place: '台东步行街', activity: '海鲜欢迎宴，配一扎原浆', cost: 120, owner: 'peng' },
        ],
      },
      {
        title: '城市体验',
        items: [
          { time: '09:30', place: '栈桥 · 小青岛', activity: '沿海散步，喂海鸥拍照', cost: 15, owner: 'tang' },
          { time: '14:00', place: '奥帆中心', activity: '帆船出海2小时，全员救生衣', cost: 240, owner: 'yiyi' },
          { time: '19:00', place: '青岛啤酒博物馆', activity: '参观并品鉴原浆', cost: 60, owner: 'peng' },
        ],
      },
      {
        title: '毕业纪念活动',
        items: [
          { time: '04:40', place: '石老人海水浴场', activity: '海边日出毕业照，跟拍师全程', cost: 0, owner: 'lu' },
          { time: '14:00', place: '中国海洋大学鱼山校区', activity: '老校区漫步，写明信片寄给一年后', cost: 10, owner: 'tang' },
          { time: '19:00', place: '海边餐厅', activity: '毕业晚宴 + 时光信封封存仪式', cost: 120, owner: 'lin' },
        ],
      },
      {
        title: '自由活动 · 返程',
        items: [
          { time: '10:00', place: '信号山 / 天主教堂', activity: '分组自由活动，买伴手礼', cost: 0, owner: 'lu' },
          { time: '13:00', place: '八大关海景民宿', activity: '退房，结算公共开销', cost: 0, owner: 'yiyi' },
          { time: '17:10', place: '青岛胶东 → 上海浦东机场', activity: '返程，到家后群里报平安', cost: 0, owner: 'lin' },
        ],
      },
    ],
  },
]

export const schemeById = (id: string) => SCHEMES.find((s) => s.id === id) ?? SCHEMES[0]

export const STORAGE_KEY = 'biye-dazi-ju:v1'

export const defaultState = (): AppState => ({
  version: 1,
  myPrefs: null,
  selected: 'consensus',
  locked: null,
  tasks: {
    'consensus-0-0': true,
    'consensus-0-1': true,
    'consensus-1-0': true,
    'budget-0-0': true,
    'memorable-0-0': true,
  },
  exited: { consensus: [], budget: [], memorable: [] },
  paid: {
    consensus: ['lin', 'yiyi', 'peng', 'lu'],
    budget: ['lin', 'yiyi', 'peng'],
    memorable: ['lin', 'yiyi'],
  },
})
