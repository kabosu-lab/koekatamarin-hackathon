/**
 * 分身、リボン、卵などの報酬を画面に出すかを決める、ただ1つの場所。
 * 隠している間も、裏では集まり続ける（記録する側はこの関数を見ない）。
 */
export function showsRewards(appearance: { avatar: string }): boolean {
  return appearance.avatar !== "hide";
}
