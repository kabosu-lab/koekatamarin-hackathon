import type { HTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import "./chip.css";

export type ChipItem = {
  id: string;
  /** 機能の名前（例：みんな） */
  label: string;
  /** こえかたの中で決めた短い記号（例：M-01） */
  code: string;
  icon: IconName;
  /** 何ができるか、どこへ行くかを一文で（0-2o(2)：ホイールで選んでいる間、チップの下に出す） */
  description?: string;
  /** 0-2v：新着の数。0 や省略なら出さない */
  badge?: number;
};

/**
 * 機能を表すカード型の「チップ」。上に絵、下に名前と短い記号、金属っぽい縁。選ばれると光る。
 * ホイールのカルーセル（0-1g(3)）と「履歴と設定」のタイル（0-1e）で同じ見た目を使う。
 * 押せるタイルにするときは、外側を button で包む（このチップ自体は押す役目を持たない）。
 */
export function Chip({
  item,
  selected = false,
  className,
  ...rest
}: { item: Pick<ChipItem, "label" | "code" | "icon" | "badge">; selected?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className ? `chip ${className}` : "chip"} data-selected={selected ? "true" : undefined} {...rest}>
      <span className="chip-art">
        <Icon name={item.icon} />
      </span>
      {(item.badge ?? 0) > 0 && (
        <span className="chip-badge" aria-label={`新着${item.badge}件`}>
          {item.badge}
        </span>
      )}
      <span className="chip-label">{item.label}</span>
      <span className="chip-code" aria-hidden="true">
        {item.code}
      </span>
    </div>
  );
}
