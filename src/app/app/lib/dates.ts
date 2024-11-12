import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

export const diff = (from: string, to: string): number => dayjs(from).diff(to);
export const timeAgo = (from: string): string => dayjs(from).fromNow();
export const display = (from: string): string => dayjs(from).format();
export const epochOf = (from: string): number => dayjs(from).unix();
