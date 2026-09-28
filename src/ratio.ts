export const ratios = ['Auto', '1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9', '27:16', '16:27', '9:8', '8:9'];
const ending = /(?:\n|^)Make it (1:1|3:2|2:3|16:9|9:16|4:3|3:4|21:9|27:16|16:27|9:8|8:9)\s*$/;
export function currentRatio(prompt: string) { return prompt.match(ending)?.[1] || 'Auto'; }
export function withRatio(prompt: string, ratio: string) {
 if (!ratios.includes(ratio)) return prompt;
 const base = prompt.replace(ending, '');
 if (ratio === 'Auto') return base;
 return `${base.trimEnd()}${base.trimEnd() ? '\n' : ''}Make it ${ratio}`;
}
