import type { Listing } from '../types.ts';

/** Builds a calendar invite for a viewing, so it lands in the phone's calendar. */
export function viewingIcs(l: Listing, durationMinutes = 45): string {
  if (!l.viewingAt) throw new Error('No viewing date');
  const start = new Date(l.viewingAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  const description = [l.url, l.agentName && `Agent: ${l.agentName}`, l.phone && `Phone: ${l.phone}`]
    .filter(Boolean)
    .join('\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HomeHunt//EN',
    'BEGIN:VEVENT',
    `UID:${l.id}@homehunt`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(`Viewing: ${l.title || l.address || 'property'}`)}`,
    l.address ? `LOCATION:${text(l.address)}` : '',
    `DESCRIPTION:${text(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Viewing in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}
