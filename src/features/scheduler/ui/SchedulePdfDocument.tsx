import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { DaySchedule } from "@/features/scheduler/domain/types";

function formatMonthLabel(monthId: string) {
  const date = new Date(`${monthId}-01T00:00:00`);
  const label = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

type DensityMode = "regular" | "compact" | "dense";

function resolveDensity(rows: DaySchedule[]) {
  const longestName = rows.reduce((max, row) => {
    const names = [...row.night, ...row.day].filter((value): value is string => Boolean(value));
    return Math.max(max, ...names.map((name) => name.length), 0);
  }, 0);

  if (rows.length >= 31 || longestName >= 18) {
    return "dense" satisfies DensityMode;
  }

  if (rows.length >= 30 || longestName >= 14) {
    return "compact" satisfies DensityMode;
  }

  return "regular" satisfies DensityMode;
}

function truncatePdfText(value: string | null, density: DensityMode) {
  if (!value) return "";

  const limit = density === "dense" ? 11 : density === "compact" ? 14 : 18;
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function applyScale(value: number, scale: number, minimum: number) {
  return Math.max(minimum, Number((value * scale).toFixed(2)));
}

function buildStyles(density: DensityMode, scale: number) {
  const config =
    density === "dense"
      ? {
          pagePaddingTop: 10,
          pagePaddingHorizontal: 10,
          pagePaddingBottom: 12,
          baseFont: 7.2,
          headerGap: 6,
          headerFont: 10.5,
          rowHeight: 17,
          cellPaddingY: 3,
          cellPaddingX: 4,
          dateWidth: 70,
          headerCellFont: 6.2,
        }
      : density === "compact"
        ? {
            pagePaddingTop: 12,
            pagePaddingHorizontal: 12,
            pagePaddingBottom: 14,
            baseFont: 7.8,
            headerGap: 8,
            headerFont: 11.5,
            rowHeight: 19,
            cellPaddingY: 4,
            cellPaddingX: 5,
            dateWidth: 76,
            headerCellFont: 6.8,
          }
        : {
            pagePaddingTop: 16,
            pagePaddingHorizontal: 16,
            pagePaddingBottom: 18,
            baseFont: 8.5,
            headerGap: 10,
            headerFont: 13,
            rowHeight: 22,
            cellPaddingY: 5,
            cellPaddingX: 6,
            dateWidth: 86,
            headerCellFont: 7.5,
          };

  const scaled = {
    pagePaddingTop: applyScale(config.pagePaddingTop, scale, 8),
    pagePaddingHorizontal: applyScale(config.pagePaddingHorizontal, scale, 8),
    pagePaddingBottom: applyScale(config.pagePaddingBottom, scale, 8),
    baseFont: applyScale(config.baseFont, scale, 6.2),
    headerGap: applyScale(config.headerGap, scale, 4),
    headerFont: applyScale(config.headerFont, scale, 9),
    rowHeight: applyScale(config.rowHeight, scale, 14),
    cellPaddingY: applyScale(config.cellPaddingY, scale, 2),
    cellPaddingX: applyScale(config.cellPaddingX, scale, 3),
    dateWidth: applyScale(config.dateWidth, scale, 62),
    headerCellFont: applyScale(config.headerCellFont, scale, 5.8),
    borderRadius: applyScale(12, scale, 8),
  };

  return StyleSheet.create({
    page: {
      paddingTop: scaled.pagePaddingTop,
      paddingHorizontal: scaled.pagePaddingHorizontal,
      paddingBottom: scaled.pagePaddingBottom,
      fontSize: scaled.baseFont,
      color: "#18181b",
      backgroundColor: "#f8fafc",
    },
    header: {
      marginBottom: scaled.headerGap,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      fontSize: scaled.headerFont,
      fontWeight: 700,
      color: "#18181b",
    },
    subtitle: {
      fontSize: scaled.headerFont,
      fontWeight: 700,
      color: "#18181b",
    },
    table: {
      borderWidth: 1,
      borderColor: "#d4d4d8",
      borderRadius: scaled.borderRadius,
      overflow: "hidden",
      backgroundColor: "#ffffff",
    },
    row: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: "#e4e4e7",
      minHeight: scaled.rowHeight,
    },
    headerRow: {
      backgroundColor: "#f8fafc",
    },
    cell: {
      paddingVertical: scaled.cellPaddingY,
      paddingHorizontal: scaled.cellPaddingX,
      flexGrow: 1,
      flexBasis: 0,
      textAlign: "center",
      justifyContent: "center",
      borderRightWidth: 1,
      borderRightColor: "#e5e7eb",
    },
    dateCell: {
      width: scaled.dateWidth,
      flexGrow: 0,
      flexBasis: "auto",
      backgroundColor: "#f4f4f5",
      fontWeight: 700,
    },
    headerCell: {
      fontSize: scaled.headerCellFont,
      fontWeight: 700,
      color: "#71717a",
      textTransform: "uppercase",
    },
    separatorCell: {
      backgroundColor: "#fafafa",
      borderRightColor: "#d4d4d8",
    },
    weekendRow: {
      backgroundColor: "#fff7ed",
    },
    lastCell: {
      borderRightWidth: 0,
    },
  });
}

export function SchedulePdfDocument({
  orgName,
  monthId,
  rows,
  scale = 1,
}: {
  orgName: string;
  monthId: string;
  rows: DaySchedule[];
  scale?: number;
}) {
  const monthLabel = formatMonthLabel(monthId);
  const density = resolveDensity(rows);
  const styles = buildStyles(density, scale);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{monthLabel}</Text>
          <Text style={styles.subtitle}>{orgName} - Nachtbereitschaft</Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.dateCell, styles.headerCell]}>Datum</Text>
            <Text style={[styles.cell, styles.headerCell]}>Nacht 1</Text>
            <Text style={[styles.cell, styles.headerCell, styles.separatorCell]}>Nacht 2</Text>
            <Text style={[styles.cell, styles.headerCell]}>Tag 1</Text>
            <Text style={[styles.cell, styles.headerCell, styles.lastCell]}>Tag 2</Text>
          </View>

          {rows.map((row, index) => (
            <View
              key={row.date}
              style={
                row.weekend
                  ? index === rows.length - 1
                    ? [styles.row, styles.weekendRow, { borderBottomWidth: 0 }]
                    : [styles.row, styles.weekendRow]
                  : index === rows.length - 1
                    ? [styles.row, { borderBottomWidth: 0 }]
                    : styles.row
              }
            >
              <Text style={[styles.cell, styles.dateCell]}>{row.weekdayLabel}</Text>
              <Text style={styles.cell}>{truncatePdfText(row.night[0], density)}</Text>
              <Text style={[styles.cell, styles.separatorCell]}>{truncatePdfText(row.night[1], density)}</Text>
              <Text style={styles.cell}>
                {row.weekend ? truncatePdfText(row.day[0], density) : ""}
              </Text>
              <Text style={[styles.cell, styles.lastCell]}>
                {row.weekend ? truncatePdfText(row.day[1], density) : ""}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
