/**
 * Reproducer: React Native never calls IHermes::resetTimezoneCache().
 *
 * After the device timezone changes while this process is alive, `Date`
 * keeps using the OLD UTC offset while a freshly built Intl formatter
 * reports the NEW zone — two standard APIs disagree inside one process.
 *
 * Steps: note the values (top line YES) → background the app (don't kill
 * it) → change the timezone in Settings → return. Top line: NO.
 * "Process started" is unchanged, so this is the same process.
 */
import React, {useEffect, useState} from 'react';
import {AppState, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

// Captured once per process: proves the app was NOT cold-started.
const PROCESS_START = new Date().toISOString();

const pad = (n: number) => String(n).padStart(2, '0');

function intlOffsetMinutes(now: Date): number | null {
  // A FRESH formatter each call — Intl's default zone resolution is live.
  // Read the wall-clock fields Intl reports for this instant and compare them
  // with the instant itself; no dependency on any timeZoneName format.
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find(p => p.type === type)?.value ?? NaN);
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  if (Number.isNaN(wallAsUtc)) {
    return null;
  }
  const instant = Math.floor(now.getTime() / 1000) * 1000;
  return Math.round((wallAsUtc - instant) / 60000);
}

function snapshot() {
  const now = new Date();
  const dateOffset = -now.getTimezoneOffset();
  const intlOffset = intlOffsetMinutes(now);
  return {
    dateOffset,
    intlOffset,
    intlZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    toStringValue: now.toString(),
    dateLocal: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate(),
    )} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    intlLocal: new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now),
    agree: intlOffset === dateOffset,
    at: now.toISOString(),
  };
}

function Screen() {
  const [s, setS] = useState(snapshot);

  useEffect(() => {
    const tick = setInterval(() => setS(snapshot()), 1000);
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') {
        setS(snapshot());
      }
    });
    return () => {
      clearInterval(tick);
      sub.remove();
    };
  }, []);

  const rows: Array<[string, string]> = [
    ['Date offset (minutes)', String(s.dateOffset)],
    ['Intl offset (minutes)', String(s.intlOffset)],
    ['Intl zone', s.intlZone],
    ['Date.toString()', s.toStringValue],
    ['Local date/time per Date', s.dateLocal],
    ['Local date/time per Intl', s.intlLocal],
    ['Process started (UTC)', PROCESS_START],
    ['Sampled (UTC)', s.at],
  ];

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Hermes timezone cache</Text>
        <Text
          testID="agree"
          style={[styles.agree, s.agree ? styles.ok : styles.bad]}>
          Date and Intl agree on the offset? {s.agree ? 'YES' : 'NO'}
        </Text>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.value}>{v}</Text>
          </View>
        ))}
        <Text style={styles.hint}>
          Background the app (don't kill it), change the timezone in Settings,
          and come back. A cold start always shows YES.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Screen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#ffffff'},
  content: {padding: 20},
  title: {fontSize: 20, fontWeight: '700', marginBottom: 12, color: '#000'},
  agree: {fontSize: 18, fontWeight: '700', marginBottom: 16},
  ok: {color: '#1b7f3a'},
  bad: {color: '#b3261e'},
  row: {marginBottom: 10},
  key: {fontSize: 12, color: '#555555'},
  value: {fontSize: 16, color: '#000000'},
  hint: {marginTop: 16, color: '#555555'},
});
