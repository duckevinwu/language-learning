import type {
  Challenge,
  ChallengeDifficulty,
  PublicChallenge,
  PublicDailyChallenge,
} from "./ai/types";

type ChallengeSeed = readonly [
  id: string,
  englishPrompt: string,
  exampleMandarinAnswer: string,
  category: string,
  notes?: string,
];

const challengeSeeds: readonly ChallengeSeed[] = [
  ["beginner-001-greet-neighbor", "Hello, how have you been recently?", "你好，你最近怎么样？", "greetings"],
  ["beginner-002-introduce-name", "Hello, my name is Kevin.", "你好，我叫Kevin。", "greetings"],
  ["beginner-003-meet-pleasure", "Nice to meet you.", "很高兴认识你。", "greetings"],
  ["beginner-004-say-goodbye", "Goodbye, see you tomorrow.", "再见，明天见。", "greetings"],
  ["beginner-005-thank-help", "Thank you for helping me.", "谢谢你帮我。", "greetings"],
  ["beginner-006-apologize-late", "Sorry, I am late.", "对不起，我迟到了。", "greetings"],
  ["beginner-007-ask-surname", "Excuse me, what is your last name?", "请问，您贵姓？", "greetings"],
  ["beginner-008-say-long-time", "Long time no see.", "好久不见。", "greetings"],
  ["beginner-009-ask-country", "What country are you from?", "你是哪国人？", "greetings"],
  ["beginner-010-answer-country", "I am American.", "我是美国人。", "greetings"],
  ["beginner-011-order-coffee", "I would like one cup of hot coffee.", "我要一杯热咖啡。", "food ordering"],
  ["beginner-012-order-no-spicy", "Please do not make it spicy.", "请不要放辣。", "food ordering"],
  ["beginner-013-ask-menu", "Do you have an English menu?", "你们有英文菜单吗？", "food ordering"],
  ["beginner-014-water", "Please give me a glass of water.", "请给我一杯水。", "food ordering"],
  ["beginner-015-check-please", "The bill, please.", "请买单。", "food ordering"],
  ["beginner-016-vegetarian", "I do not eat meat.", "我不吃肉。", "food ordering"],
  ["beginner-017-takeout", "I would like this to go.", "我要打包。", "food ordering"],
  ["beginner-018-allergy", "I am allergic to peanuts.", "我对花生过敏。", "food ordering"],
  ["beginner-019-tastes-good", "This dish is very delicious.", "这个菜很好吃。", "food ordering"],
  ["beginner-020-more-rice", "Please give me one more bowl of rice.", "请再给我一碗米饭。", "food ordering"],
  ["beginner-021-ask-price", "How much is this?", "这个多少钱？", "shopping"],
  ["beginner-022-too-expensive", "It is too expensive.", "太贵了。", "shopping"],
  ["beginner-023-smaller-size", "Do you have a smaller size?", "有小一点的吗？", "shopping"],
  ["beginner-024-try-on", "Can I try this on?", "我可以试一下吗？", "shopping"],
  ["beginner-025-pay-card", "Can I pay by card?", "可以刷卡吗？", "shopping"],
  ["beginner-026-buy-this", "I want to buy this one.", "我要买这个。", "shopping"],
  ["beginner-027-just-looking", "I am just looking.", "我只是看看。", "shopping"],
  ["beginner-028-receipt", "Please give me a receipt.", "请给我发票。", "shopping"],
  ["beginner-029-different-color", "Do you have another color?", "有别的颜色吗？", "shopping"],
  ["beginner-030-discount", "Can it be a little cheaper?", "可以便宜一点吗？", "shopping"],
  ["beginner-031-where-bathroom", "Where is the restroom?", "洗手间在哪里？", "directions"],
  ["beginner-032-go-straight", "Go straight ahead.", "一直往前走。", "directions"],
  ["beginner-033-turn-left", "Turn left at the intersection.", "在路口左转。", "directions"],
  ["beginner-034-near-hotel", "Is the hotel nearby?", "酒店在附近吗？", "directions"],
  ["beginner-035-far", "Is it far from here?", "离这里远吗？", "directions"],
  ["beginner-036-lost", "I am lost.", "我迷路了。", "directions"],
  ["beginner-037-map", "Please show me on the map.", "请在地图上给我看。", "directions"],
  ["beginner-038-next-to-bank", "The cafe is next to the bank.", "咖啡馆在银行旁边。", "directions"],
  ["beginner-039-opposite", "The supermarket is across from the park.", "超市在公园对面。", "directions"],
  ["beginner-040-subway-entrance", "Where is the subway entrance?", "地铁口在哪里？", "directions"],
  ["beginner-041-taxi-airport", "I want to go to the airport.", "我要去机场。", "transportation"],
  ["beginner-042-bus-stop", "Where is the bus stop?", "公交车站在哪里？", "transportation"],
  ["beginner-043-which-line", "Which subway line goes to the train station?", "哪条地铁线到火车站？", "transportation"],
  ["beginner-044-buy-ticket", "I want to buy one ticket.", "我要买一张票。", "transportation"],
  ["beginner-045-arrival-time", "What time does the train arrive?", "火车几点到？", "transportation"],
  ["beginner-046-missed-bus", "I missed the bus.", "我错过了公交车。", "transportation"],
  ["beginner-047-get-off-here", "Should I get off here?", "我在这里下车吗？", "transportation"],
  ["beginner-048-too-far-walk", "It is too far to walk.", "走路太远了。", "transportation"],
  ["beginner-049-taxi-cost", "About how much does a taxi cost?", "打车大概多少钱？", "transportation"],
  ["beginner-050-ride-share", "I already called a car.", "我已经叫车了。", "transportation"],
  ["beginner-051-meet-tomorrow", "Are you free tomorrow?", "你明天有空吗？", "scheduling"],
  ["beginner-052-meet-time", "Let's meet at three o'clock.", "我们三点见吧。", "scheduling"],
  ["beginner-053-cancel-plan", "I need to cancel today's plan.", "我今天要取消计划。", "scheduling"],
  ["beginner-054-reschedule", "Can we change the appointment to Friday?", "可以改到星期五吗？", "scheduling"],
  ["beginner-055-busy-now", "I am busy right now.", "我现在很忙。", "scheduling"],
  ["beginner-056-after-work", "I can go after work.", "我下班以后可以去。", "scheduling"],
  ["beginner-057-weekend-plan", "What are you doing this weekend?", "你这个周末做什么？", "scheduling"],
  ["beginner-058-late-five", "I will be five minutes late.", "我会晚五分钟。", "scheduling"],
  ["beginner-059-call-tonight", "Can I call you tonight?", "我今晚可以给你打电话吗？", "scheduling"],
  ["beginner-060-no-time", "I do not have time today.", "我今天没有时间。", "scheduling"],
  ["beginner-061-study-chinese", "I am studying Chinese.", "我在学中文。", "work/school"],
  ["beginner-062-work-office", "I work in an office.", "我在办公室工作。", "work/school"],
  ["beginner-063-have-meeting", "I have a meeting this afternoon.", "我今天下午有会议。", "work/school"],
  ["beginner-064-homework", "I need to do homework.", "我要做作业。", "work/school"],
  ["beginner-065-ask-question", "Teacher, I have a question.", "老师，我有一个问题。", "work/school"],
  ["beginner-066-dont-understand", "I do not understand.", "我不明白。", "work/school"],
  ["beginner-067-repeat-please", "Please say it again.", "请再说一遍。", "work/school"],
  ["beginner-068-speak-slowly", "Please speak a little more slowly.", "请说慢一点。", "work/school"],
  ["beginner-069-finish-work", "I finished my work.", "我做完工作了。", "work/school"],
  ["beginner-070-email", "I will send an email.", "我会发邮件。", "work/school"],
  ["beginner-071-not-feel-well", "I do not feel well.", "我不舒服。", "health"],
  ["beginner-072-headache", "I have a headache.", "我头疼。", "health"],
  ["beginner-073-doctor", "I need to see a doctor.", "我要看医生。", "health"],
  ["beginner-074-medicine", "Where can I buy medicine?", "哪里可以买药？", "health"],
  ["beginner-075-fever", "I have a fever.", "我发烧了。", "health"],
  ["beginner-076-cold", "I caught a cold.", "我感冒了。", "health"],
  ["beginner-077-water-please", "My throat hurts; please give me some water.", "我嗓子疼，请给我一点水。", "health"],
  ["beginner-078-rest", "I need to rest today.", "我今天需要休息。", "health"],
  ["beginner-079-hospital", "Where is the hospital?", "医院在哪里？", "health"],
  ["beginner-080-better-now", "I feel much better now.", "我现在好多了。", "health"],
  ["beginner-081-home-address", "My home is near the subway station.", "我家在地铁站附近。", "home"],
  ["beginner-082-room-small", "My room is a little small.", "我的房间有点小。", "home"],
  ["beginner-083-clean-house", "I need to clean the house.", "我要打扫房子。", "home"],
  ["beginner-084-wifi", "What is the Wi-Fi password?", "无线网密码是什么？", "home"],
  ["beginner-085-lights", "Please turn off the light.", "请关灯。", "home"],
  ["beginner-086-too-noisy", "It is too noisy here.", "这里太吵了。", "home"],
  ["beginner-087-key", "I forgot to bring my key.", "我忘了带钥匙。", "home"],
  ["beginner-088-cook-dinner", "I am cooking dinner at home.", "我在家做晚饭。", "home"],
  ["beginner-089-laundry", "I need to wash clothes.", "我要洗衣服。", "home"],
  ["beginner-090-live-alone", "I live alone.", "我一个人住。", "home"],
  ["beginner-091-like-tea", "I like drinking tea.", "我喜欢喝茶。", "preferences"],
  ["beginner-092-dislike-coffee", "I do not like coffee.", "我不喜欢咖啡。", "preferences"],
  ["beginner-093-prefer-noodles", "I prefer noodles.", "我比较喜欢面条。", "preferences"],
  ["beginner-094-favorite-color", "My favorite color is blue.", "我最喜欢的颜色是蓝色。", "preferences"],
  ["beginner-095-like-running", "I like running in the morning.", "我喜欢早上跑步。", "preferences"],
  ["beginner-096-weather-hot", "The weather is very hot today.", "今天天气很热。", "small talk"],
  ["beginner-097-raining", "It is raining outside.", "外面在下雨。", "small talk"],
  ["beginner-098-weekend-good", "Was your weekend good?", "你周末过得好吗？", "small talk"],
  ["beginner-099-tired-today", "I am a little tired today.", "我今天有点累。", "small talk"],
  ["beginner-100-movie-good", "This movie is very good.", "这部电影很好看。", "small talk"],
];

const intermediateChallengeSeeds: readonly ChallengeSeed[] = [
  ["intermediate-001-confirm-address","Could you help me check whether this address is correct?","你能帮我确认一下这个地址对不对吗？","directions"],
  ["intermediate-002-forgot-vegetables","I originally planned to cook, but I forgot to buy vegetables.","我本来打算做饭，可是忘了买菜。","home"],
  ["intermediate-003-running-late","If there is traffic, I may arrive about ten minutes late.","如果路上堵车，我可能会晚到十分钟左右。","transportation"],
  ["intermediate-004-less-sugar","Could this drink be made with less sugar and no ice?","这杯饮料可以做成少糖去冰吗？","food ordering"],
  ["intermediate-005-change-meeting","Something came up this afternoon, so can we move the meeting to tomorrow morning?","我今天下午临时有事，所以能把会议改到明天上午吗？","scheduling"],
  ["intermediate-006-usual-order","What do people usually order here?","这里大家一般会点什么？","food ordering"],
  ["intermediate-007-compare-quality","This looks good, but I want to compare the quality first.","这个看起来不错，不过我想先比较一下质量。","shopping"],
  ["intermediate-008-invoice-reimbursement","Please give me an invoice; I need it for reimbursement.","请给我开发票，我需要报销。","shopping"],
  ["intermediate-009-speak-slowly","My Chinese is not very fluent yet, so could you speak a little more slowly?","我的中文还不太流利，所以你能说慢一点吗？","work/school"],
  ["intermediate-010-missed-sentence","I understood the first part, but I did not catch the last sentence.","前面的部分我听懂了，但是最后一句没听清楚。","work/school"],
  ["intermediate-011-doctor-delay","The doctor is running late, so we may need to wait a little longer.","医生那边有点延误，所以我们可能还要再等一会儿。","health"],
  ["intermediate-012-medicine-timing","Should this medicine be taken before or after meals?","这个药应该饭前吃还是饭后吃？","health"],
  ["intermediate-013-upstairs-noise","The upstairs neighbor has been a little noisy lately.","楼上的邻居最近有点吵。","home"],
  ["intermediate-014-fix-wifi","The Wi-Fi at home is unstable, so I need to ask someone to fix it.","家里的无线网不太稳定，所以我得找人来修一下。","home"],
  ["intermediate-015-weekend-walk","If the weather is nice this weekend, I want to go for a walk by the river.","如果这个周末天气不错，我想去河边散散步。","small talk"],
  ["intermediate-016-after-work-tired","I originally wanted to go out tonight, but I am too tired after work.","我今晚本来想出去，但是下班以后太累了。","small talk"],
  ["intermediate-017-subway-transfer","Do I need to transfer to another subway line to get there?","去那里需要换乘另一条地铁线吗？","transportation"],
  ["intermediate-018-delivery-arrives","Could you let me know when the delivery arrives?","外卖到了以后，你能告诉我一声吗？","food ordering"],
  ["intermediate-019-quieter-place","I prefer a quieter place so it is easier for us to talk.","我比较喜欢安静一点的地方，这样我们聊天更方便。","preferences"],
  ["intermediate-020-finish-document","I need to finish this document before getting off work today.","我今天下班前得把这份文件做完。","work/school"],
  ["intermediate-021-exchange-money","Is there a bank nearby where I can exchange money?","附近有没有可以换钱的银行？","directions"],
  ["intermediate-022-larger-size","This size is a little tight; can I try one size larger?","这个尺码有点紧，我可以试大一号的吗？","shopping"],
  ["intermediate-023-call-back","I am in a meeting right now; I will call you back later.","我现在正在开会，等一下再给你回电话。","scheduling"],
  ["intermediate-024-humidifier","The room is a bit dry; could you turn on the humidifier?","房间里有点干，可以把加湿器打开吗？","home"],
  ["intermediate-025-stomach-uncomfortable","My stomach has felt uncomfortable since this morning.","我从今天早上开始胃就不太舒服。","health"],
  ["intermediate-026-buy-umbrella","I forgot to bring an umbrella, so I may need to buy one nearby.","我忘了带伞，所以可能得在附近买一把。","small talk"],
  ["intermediate-027-send-address","Could you send me the address again? I cannot find the old message.","你能再发我一次地址吗？我找不到之前的消息了。","scheduling"],
  ["intermediate-028-wait-entrance","I am almost there; please wait for me at the entrance.","我快到了，请在门口等我一下。","directions"],
  ["intermediate-029-heavy-package","This package is a little heavy; could you help me carry it upstairs?","这个包裹有点重，你能帮我搬上楼吗？","home"],
  ["intermediate-030-charge-phone","I need to charge my phone; is there an outlet nearby?","我需要给手机充电，附近有插座吗？","home"],
];

const advancedChallengeSeeds: readonly ChallengeSeed[] = [
  ["advanced-001-left-earlier","Had I known the subway would be this crowded, I would have left earlier.","早知道地铁会这么挤，我就早点出门了。","transportation"],
  ["advanced-002-not-worth-returning","This shirt has a small flaw, but it is not worth making a special trip to return it.","这件衬衫有一点瑕疵，不过不值得专门跑一趟去退。","shopping"],
  ["advanced-003-reschedule-politely","Sorry to trouble you, but could we move our appointment back by half an hour?","不好意思麻烦你，我们的约会能不能往后推半个小时？","scheduling"],
  ["advanced-004-spice-limit","I can eat a little spice, but please do not make it so spicy that I cannot taste anything else.","我可以吃一点辣，但请不要辣到吃不出别的味道。","food ordering"],
  ["advanced-005-urgent-work","I was about to leave when my manager suddenly asked me to handle an urgent issue.","我正准备出门的时候，经理突然让我处理一个急事。","work/school"],
  ["advanced-006-miss-details","I can understand the main idea, but I still miss some details when people speak quickly.","大意我能听懂，不过别人说得快的时候，我还是会漏掉一些细节。","work/school"],
  ["advanced-007-convenient-apartment","Although this apartment is not big, the neighborhood is convenient and living here is easy.","这套公寓虽然不大，但是周围很方便，住起来也省心。","home"],
  ["advanced-008-fever-hospital","If the fever does not go down by tonight, I should probably go to the hospital tomorrow.","如果今晚烧还退不下来，我明天可能得去医院。","health"],
  ["advanced-009-weather-layer","The weather has been changing a lot lately, so remember to bring an extra layer when you go out.","最近天气变化挺大，出门记得多带一件衣服。","small talk"],
  ["advanced-010-less-crowded","The line at this restaurant is too long; why don't we find somewhere less crowded?","这家餐厅排队太久了，要不我们找一家没那么挤的？","food ordering"],
  ["advanced-011-rush-hour","Taking a taxi is faster, but the subway is more reliable during rush hour.","打车会快一点，不过高峰期还是坐地铁更稳妥。","transportation"],
  ["advanced-012-delivery-installation","If the price includes delivery and installation, then I think it is acceptable.","如果这个价格包含配送和安装，那我觉得还可以接受。","shopping"],
  ["advanced-013-forgot-charger","I left in such a hurry this morning that I forgot to bring my charger.","我今天早上出门太赶，结果忘了带充电器。","home"],
  ["advanced-014-schedule-fit","I see what you mean, but I am not sure this plan fits our schedule.","我明白你的意思，不过我不确定这个安排适不适合我们的时间。","work/school"],
  ["advanced-015-quiet-catch-up","I do not dislike lively places; I just prefer somewhere quieter when catching up with friends.","我不是不喜欢热闹的地方，只是跟朋友聊天时更喜欢安静一点。","preferences"],
  ["advanced-016-missed-call","I missed your call earlier because my phone was on silent during the meeting.","刚才没接到你的电话，是因为开会时手机调成静音了。","scheduling"],
  ["advanced-017-mall-exit","Sorry to bother you, but which exit is closest to the mall?","不好意思打扰一下，请问哪个出口离商场最近？","directions"],
  ["advanced-018-sore-throat","My throat has been hurting for several days, and it gets worse when I swallow.","我的嗓子已经疼了好几天，吞咽的时候更明显。","health"],
  ["advanced-019-delivery-missing","The delivery app says the food arrived, but I still have not received it.","外卖软件显示已经送到了，可是我这边还没收到。","food ordering"],
  ["advanced-020-sit-indoors","Since it might rain later, let's sit indoors instead of outside.","既然后面可能会下雨，我们还是坐室内吧，别坐外面了。","small talk"],
  ["advanced-021-send-photo","If it is too much trouble, sending me a photo first is also fine.","如果太麻烦的话，你先发张照片给我也可以。","shopping"],
  ["advanced-022-air-conditioner","The air conditioner makes noise whenever it starts, so I want to have someone look at it.","空调每次启动都会响，所以我想找人来看一下。","home"],
  ["advanced-023-speaking-memory","I know this word when I read it, but I often cannot remember it when speaking.","这个词我看得懂，可是一开口就常常想不起来。","work/school"],
  ["advanced-024-last-train","If we cannot catch the last train, we will have to take a taxi home.","如果赶不上末班车，我们就只能打车回家了。","transportation"],
  ["advanced-025-last-minute-change","I am sorry for changing the time at the last minute; I should have told you earlier.","临时改时间真的不好意思，我应该早点告诉你的。","scheduling"],
  ["advanced-026-sold-out","By the time I got to the store, the item I wanted had already sold out.","我到店里的时候，想买的东西已经卖完了。","shopping"],
  ["advanced-027-leave-early","I would rather leave ten minutes early than rush at the last minute.","我宁愿提前十分钟出门，也不想最后赶得很急。","transportation"],
  ["advanced-028-compare-reviews","If you are not sure which one to choose, we can compare the reviews first.","如果你不确定选哪个，我们可以先比较一下评价。","shopping"],
  ["advanced-029-late-reply","I meant to reply earlier, but I got busy and forgot.","我本来想早点回复你，但是一忙就忘了。","small talk"],
  ["advanced-030-night-noise","This place is convenient, but the noise at night is starting to affect my sleep.","这个地方很方便，但是晚上的噪音已经开始影响我睡觉了。","home"],
];

function buildChallenges(
  seeds: readonly ChallengeSeed[],
  difficulty: ChallengeDifficulty,
): Challenge[] {
  return seeds.map(([id, englishPrompt, exampleMandarinAnswer, category, notes]) => ({
    id,
    englishPrompt,
    exampleMandarinAnswer,
    category,
    difficulty,
    ...(notes ? { notes } : {}),
  }));
}

export const challenges: Challenge[] = [
  ...buildChallenges(challengeSeeds, "beginner"),
  ...buildChallenges(intermediateChallengeSeeds, "intermediate"),
  ...buildChallenges(advancedChallengeSeeds, "advanced"),
];

export function getRandomChallenge(): Challenge {
  return challenges[Math.floor(Math.random() * challenges.length)];
}

export function getRandomChallengeByDifficulty(
  difficulty: ChallengeDifficulty,
): Challenge {
  const matchingChallenges = challenges.filter(
    (challenge) => challenge.difficulty === difficulty,
  );

  return matchingChallenges[Math.floor(Math.random() * matchingChallenges.length)];
}

export function getRandomDailyChallenge(): PublicDailyChallenge {
  return {
    id: `day-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    challenges: [
      toPublicChallenge(getRandomChallengeByDifficulty("beginner")),
      toPublicChallenge(getRandomChallengeByDifficulty("intermediate")),
      toPublicChallenge(getRandomChallengeByDifficulty("advanced")),
    ],
  };
}

export function getChallengeById(id: string): Challenge | undefined {
  return challenges.find((challenge) => challenge.id === id);
}

export function toPublicChallenge(challenge: Challenge): PublicChallenge {
  return {
    id: challenge.id,
    englishPrompt: challenge.englishPrompt,
    category: challenge.category,
    difficulty: challenge.difficulty,
    exampleAnswer: challenge.exampleMandarinAnswer,
    ...(challenge.notes ? { notes: challenge.notes } : {}),
  };
}
