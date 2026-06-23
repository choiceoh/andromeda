// Generic dense data grid + the shared disconnected/error/loading/empty notice.
// Panes describe their columns declaratively; the table chrome (header, row
// hairlines, hover) lives in the .dgrid class in styles.css.
import type { CSSProperties, ReactNode } from "react";
import { color, muted } from "@/theme";
import { errText } from "@/format";
import { useWorkspace } from "@/workspaceContext";

export interface Column<T> {
  header: ReactNode;
  width?: number;
  cell: (row: T) => ReactNode;
  tdStyle?: CSSProperties; // merged onto the cell <td> (e.g. ellipsis, nowrap)
}

export function Grid<T>({
  columns,
  rows,
  getKey,
  maxWidth,
  rowStyle,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  maxWidth?: number;
  rowStyle?: (row: T) => CSSProperties;
  // When set, rows become clickable (open a detail/edit modal). Action buttons in a
  // cell should wrap themselves in a stopPropagation span so they don't also fire this.
  onRowClick?: (row: T) => void;
}) {
  return (
    <table className="dgrid" style={{ maxWidth }}>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} style={c.width ? { width: c.width } : undefined}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={getKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{ ...(onRowClick ? { cursor: "pointer" } : null), ...rowStyle?.(row) }}
          >
            {columns.map((c, i) => (
              <td key={i} style={c.tdStyle}>
                {c.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Wrap row-action buttons so a click on them doesn't also trigger the row's
// onRowClick (open-detail). Use inside a clickable grid's action cell.
export function StopClick({ children }: { children: ReactNode }) {
  return <span onClick={(e) => e.stopPropagation()}>{children}</span>;
}

// Renders a notice (and nothing else) when the grid can't show rows yet; checks
// error BEFORE empty so a failed RPC isn't misreported as "no data". Otherwise
// renders its children (the table).
export function GridNotice({
  query,
  count,
  empty,
  children,
}: {
  query: { isLoading: boolean; isError?: boolean; error?: unknown };
  count: number;
  empty: string;
  children: ReactNode;
}) {
  const { connected } = useWorkspace();
  const notice: CSSProperties = { ...muted, fontSize: 13 };
  if (!connected) return <p style={notice}>게이트웨이에 연결하면 표시됩니다 (좌측 하단).</p>;
  if (query.isError) return <p style={{ fontSize: 13, color: color.danger }}>불러오기 실패: {errText(query.error)}</p>;
  if (query.isLoading) return <p style={notice}>불러오는 중…</p>;
  if (count === 0) return <p style={notice}>{empty}</p>;
  return <>{children}</>;
}

// Compact inline action button for grid rows (읽음 / 보관 / 삭제 / 실행 …).
export function RowBtn({
  children,
  onClick,
  disabled,
  danger,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      className="row-btn"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={danger ? { color: "var(--due)" } : undefined}
    >
      {children}
    </button>
  );
}
