/**
 * 目的地费用与特征画像（确定性估算，非实时价格）。
 * 未收录的城市使用 DEFAULT_PROFILE，并在方案中标注“费用为估算”。
 */
export interface DestinationProfile {
  /** 往返大交通（人均，元） */
  transport: number
  /** 单间每晚（两人一间，元） */
  roomPerNight: number
  /** 每人每天餐饮（元） */
  foodPerDay: number
  /** 每人门票/活动（元，整趟） */
  tickets: number
  /** 每天市内交通（每 4 人拼一车，元） */
  localPerDayPerCar: number
  /** 单程大交通耗时（小时） */
  hours: number
  /** 6 月下旬是否常见 35°C 以上高温 */
  hot: boolean
  /** 是否有山或海的风景 */
  scenery: boolean
  /** 是否主要依赖夜间航班/夜车才能压低价格 */
  redEye: boolean
  spots: [string, string, string]
  known: boolean
}

const P = (
  transport: number,
  roomPerNight: number,
  foodPerDay: number,
  tickets: number,
  localPerDayPerCar: number,
  hours: number,
  hot: boolean,
  scenery: boolean,
  redEye: boolean,
  spots: [string, string, string],
): DestinationProfile => ({ transport, roomPerNight, foodPerDay, tickets, localPerDayPerCar, hours, hot, scenery, redEye, spots, known: true })

export const DESTINATION_PROFILES: Record<string, DestinationProfile> = {
  成都: P(1100, 360, 120, 200, 160, 7.5, false, false, false, ['大熊猫繁育研究基地', '人民公园鹤鸣茶社', '四川大学望江校区']),
  青岛: P(1180, 420, 140, 280, 140, 6.5, false, true, false, ['栈桥与小青岛', '奥帆中心帆船', '石老人海水浴场']),
  长沙: P(620, 300, 100, 120, 120, 4.5, true, true, false, ['岳麓山爱晚亭', '湖南博物院', '橘子洲头']),
  重庆: P(1050, 320, 110, 160, 160, 8, true, true, false, ['洪崖洞', '李子坝轻轨站', '南山一棵树观景台']),
  西安: P(900, 320, 100, 260, 140, 6, true, false, false, ['兵马俑', '大唐不夜城', '西安城墙骑行']),
  厦门: P(950, 380, 130, 160, 140, 5.5, false, true, false, ['鼓浪屿', '环岛路', '厦门大学']),
  大理: P(1500, 300, 110, 200, 200, 9, false, true, true, ['洱海骑行', '大理古城', '苍山索道']),
  杭州: P(160, 380, 130, 120, 140, 1, true, true, false, ['西湖', '灵隐寺', '良渚古城遗址']),
  南京: P(280, 320, 110, 120, 120, 1.5, true, true, false, ['中山陵', '夫子庙秦淮河', '先锋书店']),
  北京: P(1100, 420, 130, 240, 160, 4.5, true, false, false, ['故宫', '颐和园', '清华北大校园']),
  三亚: P(1700, 480, 150, 320, 200, 3.5, true, true, true, ['亚龙湾', '蜈支洲岛', '天涯海角']),
  哈尔滨: P(1400, 300, 110, 160, 140, 3.5, false, false, false, ['中央大街', '圣索菲亚教堂', '松花江畔']),
  昆明: P(1350, 280, 100, 160, 140, 3.5, false, true, false, ['滇池', '翠湖公园', '云南大学']),
  桂林: P(1100, 280, 100, 260, 180, 7, true, true, false, ['漓江竹筏', '阳朔西街', '遇龙河']),
  苏州: P(120, 340, 120, 160, 120, 0.5, true, false, false, ['拙政园', '平江路', '金鸡湖']),
}

export const DEFAULT_PROFILE: DestinationProfile = {
  transport: 1000,
  roomPerNight: 340,
  foodPerDay: 115,
  tickets: 180,
  localPerDayPerCar: 150,
  hours: 6,
  hot: false,
  scenery: false,
  redEye: false,
  spots: ['城市地标', '当地博物馆', '老城街区'],
  known: false,
}

export function profileOf(city: string): DestinationProfile {
  return DESTINATION_PROFILES[city.trim()] ?? DEFAULT_PROFILE
}
