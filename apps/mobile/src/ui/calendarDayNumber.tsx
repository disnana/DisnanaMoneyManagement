import { Platform } from 'react-native';

export function calendarDayNumber(day: number, holiday: string | undefined) {
  // React Native Web filters the HTML title prop on Text and Pressable.
  return Platform.OS === 'web' && holiday ? <span title={holiday}>{day}</span> : day;
}
