# プロジェクト仕様書

最終コード確認日: 2026-09-19

本書は、PomoTM / Tomato Focus の現在のリポジトリ実装を将来の開発者およびAIへ共有し、デグレードや過去仕様への先祖返りを防止するための基準文書である。会話履歴や過去の要件ではなく、現在のソースコードを正として記載している。

## 0. 仕様保護の原則

- Matter.js の物理ステップ、イベント配列、Body管理Set、描画順、カメラ更新順は相互依存している。`PhysicsCanvas.tsx` を変更する場合は、単独の処理だけを見て順序を変えてはならない。
- `Matter.Engine.update(engine, safeDelta)` はタイマーの再生・停止とは独立して毎フレーム実行する。ページが非表示の場合も、`Engine.update` 実行後に描画処理をスキップする順序を維持する。
- 現在の物理デルタ上限は `16.666ms` である。過去資料にある `33.33ms` へ戻してはならない。
- タイマー・React Stateの最新値は、長寿命なMatter.js描画クロージャへ `Ref` 経由で渡している。この同期構造を通常のクロージャ参照へ安易に置換しない。
- 個別トマトの座標は永続化しない。保存・復元対象はカウント、所持金、バフ、アンロック、最高標高、カメラ状態である。
- `src/app/page.tsx` のレイヤー順、広告領域、モバイル時のCanvas開始位置、共通フッターの左下配置を維持する。

## 1. アプリ概要・主要機能

### 1.1 技術構成

- Next.js App Router 16系、React 19、TypeScript strict mode。
- Tailwind CSS 4系を `src/app/globals.css` から読み込む。
- Matter.js 0.20系をCanvas物理演算に使用する。
- UIアイコンは `lucide-react` を使用する。
- Vercel Analytics と Vercel Speed Insights をRoot Layoutに常設する。
- パスエイリアスは `@/* -> ./src/*`。
- 開発アクセス許可は `localhost:3000` と `192.168.56.1`。

### 1.2 タイマー

| 項目 | 現在値・挙動 |
| --- | --- |
| 集中 | 25分 (`25 * 60` 秒) |
| 休憩 | 5分 (`5 * 60` 秒) |
| 更新周期 | 250msで期限時刻との差分から残り秒を再計算 |
| 集中時の通常供給 | 5〜10秒のランダムな再帰 `setTimeout` |
| タイマーデバッグ供給 | 集中かつ再生中に1秒間隔 |
| Pause | 残り時間を期限から再計算し、タイマー・通常供給・デバッグ供給を停止 |
| Reset | Pause後、現在モードの初期時間へ戻す |
| モード切替 | Pause後、選択モードの初期時間へ戻す |

- 集中完了時は、完了コールバックを呼び、トマトを1回供給し、休憩へ切り替えて内部的には再生状態を維持する。
- `page.tsx` 側が集中完了を検知してリワードモーダルを開き、直後に休憩タイマーを一時停止する。
- 休憩完了時は集中モードへ戻し、25分に設定して停止する。
- Repeatアイコンの自動切替StateとトグルUIは存在するが、現在の `useTimer` の完了分岐は `autoLoopEnabled` / `autoLoopRef` を参照していない。現在の実挙動は上記の固定遷移である。
- Spaceキーは再生／一時停止を切り替える。キーリピート中、リワードモーダル表示中、動画再生中、入力要素・選択要素・ボタン・contenteditableにフォーカス中は無効。
- ブラウザタイトルは `MM:SS · 集中` または `MM:SS · 休憩` に更新する。

### 1.3 リワード動画とボーナス休憩

- 集中完了後にリワードモーダルを表示する。
- 「動画を見てボーナス獲得」は5秒の疑似動画カウントダウンを開始する。
- 完了後は `isBonusBreakMode = true` とし、休憩タイマーを再開する。
- スキップ時はボーナス状態を消去し、通常休憩を開始する。
- ボーナス休憩中かつ休憩タイマー再生中は、1.5秒間隔でトマトを供給する。
- ボーナス状態は、休憩完了、残り0、モード切替、リセット、集中モードへの遷移時に消去する。
- リワードモーダル中もMatter.jsの `Engine.update` は停止しない。

### 1.4 トマト抽選仕様

色抽選とサイズ抽選は独立しているため、金色かつ巨大などの組み合わせが成立する。

| 抽選 | 通常 | ボーナス休憩 | Gold Boost有効時 |
| --- | ---: | ---: | ---: |
| 金トマト | 1% | 10% | 各モードの2倍（2% / 20%） |
| 極小 | 1% | 1% | 変更なし |
| 巨大 | 2% | 30% | 変更なし |
| 通常サイズ | 97% | 69% | 変更なし |
| 初期完熟 | 非Goldの4% | 非Goldの4% | 変更なし |
| Dud直接スポーン | なし | なし | なし |

- 通常半径は基準 `20〜25px` に `0.92〜1.08` の個体差を掛ける。
- 極小はさらに `0.3〜0.4` 倍、巨大は `2.5〜3.0` 倍。
- 飛行機・ロケット用のMediumは基準半径に `1.4` と個体差を掛ける。
- 親から明示的なGold値が渡された場合は色の再抽選を行わず、その値を維持する。
- `CONFIG.goldenChance = 0.01` は存在するが、現在の供給抽選は `SUPPLY_GOLDEN_CHANCE` / `BONUS_BREAK_GOLDEN_CHANCE` を使用する。

### 1.5 トマトの物性

- Body形状は常に `Bodies.circle`。扁平な物理Bodyは使用しない。
- 基準密度は `0.001 * radiusRatio`。Goldはさらに3.5倍。
- 共通設定は `frictionStatic: 1.0`、`frictionAir: 0.02`、`slop: 0.05`、`sleepThreshold: 30`。

| 種類 | restitution | friction |
| --- | ---: | ---: |
| Standard | 0.25 | 0.60 |
| Medium | 0.20 | 0.55 |
| Giant | 0.10 | 0.50 |
| Gold（サイズを問わず優先） | 0.05 | 0.30 |

- 生成時に小さなランダム角速度を与える。
- 下層中央は反発0・摩擦0.9、側面シェルは反発0.075・摩擦0.3へ動的に調整する。

### 1.6 完熟・感染・破裂

- 初期完熟トマトは非Goldの4%。初期完熟には長時間の感染無敵タイマーを設定しない。
- 完熟トマトは衝突開始時のみ、相対速度、相手質量、自重圧力から破裂判定する。`collisionActive` は使用しない。
- `pressureLoad` は最大250、毎フレーム相当で0.94倍に減衰する。
- 基礎耐久値はStandard 4、Medium 12、Giant 40、Gold 60。
- 実効耐久値は `max(1, baseDurability - pressureLoad * 0.6)`。
- 衝撃力は `other.mass * relativeSpeed`。圧力が基礎耐久値の2.5倍以上の場合も破裂する。
- 破裂時は5〜10個の赤い果汁パーティクルを生成し、BodyをWorldと全管理Set／描画キャッシュから除去する。
- 破裂時の感染判定はその瞬間の1回のみ。感染半径は破裂元半径の2倍、候補ごとの感染率は10%。半径による確率補正はしない。
- 感染対象は非Gold・未完熟・未破裂のトマト。Static / Dynamicを問わない。
- 後発感染時のDud確率は1%。Dudの耐久値は100倍。
- 後発感染の破裂待機時間は以下の分布。
  - 50%: 10〜30秒未満。
  - 25%: 30〜60秒未満。
  - 25%: 60〜290秒を10秒刻みで均等選択。
- 感染トマトの時限破裂では周囲Static Bodyを動的化しない。感染由来ではない衝撃破裂では、半径3倍の近傍を起こし、125px以内のStatic CoreをDynamicへ戻す処理がある。
- 無敵時間中のリング／パルス描画は存在しない。

### 1.7 Matter.jsエンジンと安全装置

- エンジン設定:
  - `enableSleeping: true`
  - `positionIterations: 10`
  - `velocityIterations: 8`
  - gravity: `{ x: 0, y: 1.05 }`
- 描画ループは `requestAnimationFrame`。
- 毎フレームの順序は概ね次の通り。
  1. `rawDelta` を算出し `safeDelta = min(rawDelta, 16.666)`。
  2. ページ非表示時の演出用 `frameDelta` を0にする。
  3. `Engine.update(engine, safeDelta)` を必ず実行。
  4. ページ非表示なら次フレームを予約して描画・イベント更新を終了。
  5. 完熟遷移、感染タイマー、圧力減衰、イベント、カメラ、描画を更新。
- `beforeUpdate` と `afterUpdate` の両方で全World Bodyの有限数チェックを行う。
- positionまたはvelocityがNaN / InfinityのBodyだけを即時削除する。
- 速度が30を超えた場合、方向を維持して速度25へクランプする。
- トマト同士が合計半径の85%未満まで重なった場合、重なり量の30%をDynamic Bodyへ配分して位置補正する。
- ページ非表示時は供給キューを破棄し、フレーム時計を `performance.now()` でリセットする。
- アンマウント時はRAF、Interval、DOMイベント、Matterイベント、ResizeObserverを解除し、Engineをclearする。

### 1.8 Body管理、Deep Core、Terrain

- Body管理Set: `activeBodies`、`sleepingBodies`、`pendingSleeping`、`staticCoreBodies`、`lowerStaticBodies`。
- sleepStart / sleepEndイベントでSetと睡眠描画キャッシュを同期する。
- 画面内トマトが1,000個を超えた場合、中央25〜75%内かつ十分に埋没した静止BodyをStatic Core化する。
- 側面シェルは可視範囲にある限りDynamicを維持し、流動性を確保する。
- Deep Core評価とTerrain評価は各60フレームごと。
- World絶対座標で `y > canvasHeight + 2000px` のBodyのみをオフスクリーンTerrainへ吸収する。横方向やカメラ上方向を理由に削除しない。
- 吸収時はトマトをアーカイブCanvasへ描き、96分割の高さ情報からCompound Terrainを再構築して、元BodyをWorldから削除する。
- Body数の単純上限や最古Body削除は存在しない。
- 個別トマト座標の保存・復元およびCanvas Bakingによる深層Body削除は存在しない。

### 1.9 カメラ、再開、背景

- 通常起動時のカメラRef初期値は1.0。`CONFIG.world.initialCameraScale = 0.88` は現在参照されていない。
- 動的ズーム下限は `MIN_DYNAMIC_CAMERA_SCALE = 0.20`。
- 山が左右10%の安全域または画面高さ48%の安全ラインを越えると、必要スケールと上方向オフセットを計算し、係数0.03で追従する。
- 標高は、静止済み・Sleeping・生成後2秒以上かつ低速のトマトとアーカイブTerrainの最高点から算出する。換算は概ねCanvas上の2px = 1m。
- 最高標高が保存済みの再開時は、ズームを0.48へ固定し、保存カメラYまたは `initialMaxAltitude * 2` を復元する。
- 再開時は個別トマトを復元せず、画面下部に重なり合う円形Static BodyのCloud Floorを1つのCompound Bodyとして生成し、トマト0個の物理Worldから再開する。
- Cloud Floorは見た目と当たり判定を同じ円群から描画し、長方形の白線は描かない。左右から落ちて床下300px相当を越えたBodyを削除する。
- カメラ状態は10秒ごと、一時停止時、beforeunload、アンマウント時に保存する。
- 背景は標高に応じてダーク／休憩ライト配色を補間する。
- 高度演出:
  - 850〜2,150m付近: 流れる雲。
  - 1,900〜2,570m付近: 雨。
  - 2,400〜3,080m付近: 風ラインと明るい空。
  - 約2,900m以降: 星空。
- 星は112個、7個の密集中心、3レイヤー。右から左へ流れ、標高視差係数は0.02 / 0.08 / 0.18、サイン波で瞬く。
- 背景ランドマークはピサの斜塔と自由の女神。背景色でfillして後景を遮蔽し、テーマ色を不透明度0.18でstrokeする。

### 1.10 供給キャリアと高度イベント

通常供給は、タイマーから `PhysicsCanvasHandle.drop(golden)` を呼び、現在高度に応じたキャリアへ渡す。休憩中は通常供給を止め、ボーナス休憩のみ供給可能。UFOデバッグ中は通常供給を止める。

| 条件 | キャリア／イベント | 現在仕様 |
| --- | --- | --- |
| 0〜2,999m | Bird | 約2.2〜2.8秒で横断、2段階羽ばたき、途中で保持トマトを落とす |
| 0〜2,999m | Balloon | 通常供給ごとに1%、Balloon Boost時2%でBirdの代わりに発生。13〜15秒横断、可視中央60%で250msごとに連続投下 |
| 3,000〜9,999m | Plane | Birdの代わりに飛行機SVG。Mediumトマトを投下。70〜105msごとに飛行機雲を生成し、1.7〜2.4秒で拡散・消滅 |
| 3,000m以上 | Rocket | Focus再生中のみ。3,000〜9,999mは45秒、10,000m以上は15秒ごとに10%抽選。Balloon Boost時20%。1機のみ、13〜15秒横断、後部からMediumを250msごとに投下 |
| 10,000m以上 | Satellite | Planeから100%切替。136px相当、9.5〜10.5秒横断、開始・終了Yを各20〜30%から独立抽選、10秒で1回転、初期角度ランダム、不透明度0.35 |
| 10,000m以上 | Satellite Radio | 2〜5秒のランダム間隔、および投下前後にサイバーブルーの3重波紋。トマトは衛星下部直下から投下 |

追加イベント:

- Shooting Star: 3,000m以上、60秒ごとに18%、同時1つ、寿命0.8〜1.5秒。
- Aurora: 5,000m以上、60秒ごとに18%、同時1つ。4秒fade-in、15〜20秒滞留、4秒fade-out。
- Space Alien: 10,000m以上、30秒ごとに5%、同時1体、10〜16秒横断。タイマー再生状態は条件に含まれない。
- UFO: アンロック済みかつFocus再生中。10,000m未満は45秒ごと、10,000m以上は15秒ごとに10%抽選。通常時は同時1機。2.2秒進入、20〜60秒滞在、3秒退出。上空20〜30%で複合サイン波とランダム目標YへのLERPを合成し、1.4秒ごとに必ずGiantを投下する。
- Space Octopus: 1,000 Goldで永久アンロック。Focus再生中かつUFOデバッグOFFで60秒ごとに15%抽選、同時1体。15秒滞在し、1.5〜2.0秒ごとにGoldを確定投下する。出現時は未完了キャリアを退避キューへ戻す。
- UFOまたはOctopusが通常供給と競合した場合、供給要求は `deferredDeliveries` に保持し、特殊イベント終了後に再開する。
- Double Drop有効時はCarrier、Balloon、Rocket、UFOの1回の物理生成数を2個へ増やす。Octopusは常に1個ずつ。

### 1.11 描画仕様

- 描画順の主要部分:
  1. 標高グラデーション、雲／雨／風／星／流れ星／オーロラ／ランドマーク。
  2. 背景Canvas、アーカイブTerrain、Cloud Floor。
  3. SleepingトマトのキャッシュCanvas。
  4. Active / pending sleepingトマト。
  5. 果汁、飛行機雲、キャリア、UFO、Octopus、Alien。
  6. 物理異常診断オーバーレイ。
- SleepingトマトはオフスクリーンCanvasへまとめ、最低500ms間隔または強制dirty時に再構築する。
- トマト画像URLが空の場合はCanvas図形で描画する。赤／金のマットな円、輪郭、5枚の緑色ヘタを描く。表面ハイライトは描かない。
- 完熟度は約700msで通常赤から濃い赤へ補間する。
- Birdが運搬中のトマト、各キャリア投下前のトマト、物理Bodyのトマトは同じ `drawTomato` を使用する。

### 1.12 ショップ、通貨、バフ

- 通貨は所持Goldトマト。金トマトが物理Worldへ生成された時に加算する。
- 購入時は通貨と論理カウントを減らし、物理World上のGold Bodyを山の上側（`bounds.min.y` が小さい順）から消費数まで削除する。World上のGoldが不足してもエラーにしない。
- バフ時間は各30分。Focusかつタイマー再生中のみ1秒ずつ減算し、休憩中は減算しない。

| アイテム | コスト | 効果 |
| --- | ---: | --- |
| Double Drop | 3 Gold | 対応する1回の供給数を2個へ増加 |
| Balloon / Rocket Boost | 5 Gold | 高度3,000m未満では気球、高度3,000m以上ではロケットの確率を2倍。UI文言だけ高度で切替、内部Stateは共通 `balloonBoost` |
| Gold Boost | 10 Gold | 通常／ボーナスのGold率を2倍 |
| UFO永久解放 | 100 Gold | UFOイベントを有効化 |
| Space Octopus永久解放 | 1,000 Gold | 宇宙タコイベントを有効化 |

- 有効なバフは `ACTIVE` と残り `MM:SS` を表示し、再購入不可。
- ショップ末尾には「※休憩中はアイテムの減算は行われません。」を1回だけ表示する。

### 1.13 永続化

| キー | 内容 |
| --- | --- |
| `tomato-focus:v1` | 論理獲得数 `{ normal, gold }` |
| `tomato-focus:progress:v1` | 所持Gold、バフ状態・残時間、アンロック状態 |
| `pomo_unlocked_items` | UFO / Octopus永久解放 |
| `pomo_max_altitude` | 最高標高 |
| `pomo_total_gold_tomatoes` | 累計Gold獲得数 |
| `pomo_unlocked_events` | アンロックイベント一式 |
| `pomo_saved_camera` | `{ scale, offsetY }` |

- 保存値は有限数・非負整数・上限50,000などを検証し、不正な値は破棄または0へ戻す。
- `counts` は親Stateと保存には使用され、`PhysicsCanvas` にPropsとして渡されるが、現在はBody復元には使用されていない。
- `CONFIG.maxRestoredBodies = 80` は現在参照されていない。

## 2. UI / レイアウト仕様（崩してはいけない要素）

### 2.1 全体構造とレイヤー

- `html, body` は幅・高さ100%、`overflow: hidden`。ゲーム画面自体にページスクロールを発生させない。
- Homeは `100dvh` / `w-screen` / `max-w-full` の全画面。外側背景はFocusで `neutral-950`、Breakで `neutral-100`。
- 内側は最大幅1,380pxの横Flex。ゲームカードとデスクトップ広告を中央配置する。
- ゲームカードは `min-w-0`、`max-w-full`、最大 `5xl`、全高、角丸、境界線、`overflow-hidden`。
- 主要z-index:
  - Canvasコンテナ: `z-10`、`pointer-events-none`。
  - タイマー／標高／モバイル広告: `z-20`。
  - 上部ツールバー: `z-30`。
  - Shop Modal: `z-50`。
  - Reward Modal: `z-[60]`。
  - 共通Privacy Footer: `z-[70]`。
- Canvasの親とCanvas自身に `min-w-0` / `max-w-full` / `overflow-hidden` を適用し、リサイズ時にカード外へ出さない。

### 2.2 タイマー表示

- `MM:SS` をカード中央へ絶対配置する。
- サイズは `clamp(5rem, 20vw, 14rem)`、極太、tabular nums、`pointer-events-none`。
- Matter.js Canvasより前面に置き、背景座布団は使用しない。
- Focusは `text-white/90`、Breakは濃色。Breakテーマへ700msで遷移する。

### 2.3 上部ツールバー

- カード上端からモバイル12px、sm以上20px。左右はモバイル12px、sm以上24px。
- 1行の横Flexを維持する。モバイルでは左寄せ、md以上で左右グループを `justify-between`。
- 狭い画面では `overflow-x-auto` と `touch-pan-x` により横スワイプ可能。親幅を押し広げない。
- `.no-scrollbar` によりFirefox、旧Edge/IE系、WebKitのスクロールバーを非表示にする。
- ボタンは `shrink-0`。モバイルは小さなpadding・gap・text-xs、sm以上で通常サイズへ戻す。
- 左グループ: Pencil 25m、Coffee 5m。
- 右グループ: Play、Pause、Reset、Repeat、Shop、Gold所持数。統合デバッグモード時のみZap、UFOデバッグ、10sを追加表示する。
- インタラクティブUIはCanvasより前面で、Canvasはポインターイベントを受け取らない。

### 2.4 広告枠

- 現在は実広告コードではなく、30秒ごとに `data-ad-refresh` カウンターを更新するプレースホルダーコンポーネント。
- Desktop:
  - `md` 以上で表示、モバイルでは非表示。
  - 幅300px、`xl` 以上で336px。
  - 高さは `min(600px, 100dvh - 2rem)`。
  - ゲームカード右側、`shrink-0`。
- Mobile:
  - `md` 未満のみ表示。
  - カード内 `left/right: 0.5rem`、上から4.5rem、z-20、高さ50px。
  - Canvasの表示開始位置はモバイルで上から7.75rem。`md` 以上では上端0。
- 広告コンテナは角丸、破線境界、半透明背景、`overflow-hidden`。

### 2.5 標高表示

- カード右下に `○○ m` のみを表示し、「標高」という接頭辞は付けない。
- モバイルはbottom/right 12px、sm以上20px。半透明の丸いバッジ、z-20、pointer-eventsなし。

### 2.6 プライバシーポリシーリンク

- Root Layoutの共通 `<footer>` に配置し、全ルートで表示する。
- 画面左下固定。`left-3`、sm以上 `left-4`。
- 下余白は `max(0.75rem, env(safe-area-inset-bottom))` で端末のSafe Areaを考慮する。
- `z-[70]`。薄い黒背景、zinc-400の10px文字、sm以上12px、角丸の控えめなテキストリンク。
- 遷移先は `/privacy`。中央や右下へ戻さない。

### 2.7 プライバシーポリシーページ

- `/privacy` はServer Componentで、独自に `h-[100dvh] overflow-y-auto` を持つ。グローバルbodyのoverflow hidden下でも縦スクロール可能。
- 最大幅3xlのレスポンシブカード。
- Google AdSense / Cookie、Googleポリシー外部リンク、Vercel Analytics / Speed Insights、免責事項、トップへ戻るリンクを含む。
- 外部Googleリンクは別タブで開き、`noopener noreferrer` を付与する。

### 2.8 Shop / Reward Modal

- Shopはカード全体を覆う絶対配置。背景クリックで閉じ、ダイアログ内のmousedownは伝播停止。
- Shopカードは最大lg。所持Gold、UFO解放、3種バフ、Octopus解放を表示する。
- RewardはShopより前の `z-[60]`、最大md。疑似動画中は5秒カウントを表示する。
- Break時はアプリ、カード、ボタン、モーダル、Canvas背景を明るいテーマへ遷移する。既存実装には休憩アクセントとしてemerald色が存在する。

## 3. 現在のデバッグ機能・制御仕様

### 3.1 Zapタイマーデバッグ

- 上部ツールバーのZapボタン。統合デバッグモード時のみ表示する。
- `useTimer.debugEnabled` と `debugRef` で管理する。
- ONかつFocusかつ再生中のみ、1,000msごとに通常供給コールバックを実行する。
- Pause、Reset、モード切替で供給Intervalを停止する。再Start時にONなら再開する。
- Breakでは実行しない。
- 統合デバッグモードがOFFになった場合はState、Ref、Intervalを強制的にOFFへ戻し、非デバッグ環境から有効化できない。

### 3.2 UFOデバッグ

- 上部ツールバー最右側付近のDisc3アイコン。統合デバッグモード時のみ表示する。
- React State `debugUfoMode` を `PhysicsCanvas` の `debugUfoModeRef` へ同期する。
- ONかつFocus再生中はBird、Plane、Satellite、Balloon、Rocket、通常供給待ちを消去し、UFOを最大5機まで即時補充する。
- 5機は左右交互、別位相・周波数・振幅・Y目標を持ち、独立して有機的にホバーする。
- UFOデバッグ中は親の通常トマト供給、Rocket、Octopusを停止する。
- OFFへ戻す際は通常UFO抽選時刻を再設定し、複数UFOが残っていれば1機へ縮小する。
- `PhysicsCanvas` 内でも `isDebugModeRef && debugUfoModeRef` を有効条件とし、通常ユーザー環境ではUFOデバッグ処理へ入らない。

### 3.3 10秒タイマースキップ

- 統合デバッグモード時のみツールバーへ表示する。
- FastForwardアイコンと `10s` 表記。
- 押下時、現在の残り時間を10秒へ設定し、再生中ならdeadlineも更新する。
- 本番ビルドでは描画しない。

### 3.4 物理診断ログと画面オーバーレイ

- NaN・Infinity検出、速度クランプ、異常Body除去は統合デバッグモードに関係なく常時有効。
- `beforeUpdate` / `afterUpdate` でNaN・Infinityを検出した時に、安全処理は常に発火する。
- 同一reason/body IDのログは2秒以内の重複出力を抑制する。
- 統合デバッグモード時のみ、`console.error("[PhysicsDiagnostic]", ...)` へ原因、phase、Body詳細、Body数、カメラ、全トマトスナップショットを出力する。
- 統合デバッグモード時のみ、Canvas左上付近 `(12, 76)` に赤い `PHYSICS ANOMALY DETECTED` オーバーレイを描く。
- アラートは再代入またはコンポーネント再初期化まで保持され、自動消去タイマーはない。
- 異常Bodyのみを除去し、World全体やエンジンは停止しない。

### 3.5 その他の可視ステータス

- 右下に現在標高を常時表示する。
- Shopに所持Gold、各バフのACTIVE状態と残時間、永久解放状態を表示する。
- Reward疑似動画中は残り秒を大きく表示する。
- Adプレースホルダーは `data-ad-refresh` に30秒更新カウントを持つが、画面には数値表示しない。

### 3.6 統合デバッグモード

- 判定ロジックは `src/hooks/useDebugMode.ts` に一元化する。
- 次のいずれかを満たす場合だけ `isDebugMode = true`。
  - URLクエリの値が厳密に `debug=true`。
  - `process.env.NEXT_PUBLIC_DEV_MODE === "true"`。
  - `process.env.NODE_ENV === "development"`。
- `debug=false`、`debug=1`、`debug=True`、`debug=truefoo` はURL条件として成立しない。
- URLはClient ComponentのEffect内で安全に読み、SSR中に `window` へアクセスしない。ブラウザのpopstate時にも再評価する。
- デバッグ判定および各デバッグON/OFF状態はlocalStorageへ保存しない。
- 通常ゲームのイベント、物理安全処理、タイマー、Canvas描画は統合デバッグモードの影響を受けない。

## 4. ファイル構造と主要コンポーネント

### 4.1 核心ファイル

| ファイル | 責務 | 変更時の保護事項 |
| --- | --- | --- |
| `src/components/PhysicsCanvas.tsx` | Matter Engine/World所有、RAF、Body lifecycle、衝突、感染、Terrain、カメラ、全高度イベント、描画統括 | `Engine.update`の位置、Ref同期、Set間移動、イベント順、描画順を維持。最重要核心ファイル |
| `src/app/page.tsx` | 全画面UI、React State、タイマー接続、Reward、Shop購入、Gold通貨、Spaceキー、広告配置 | z-index、モバイルCanvas top 7.75rem、ツールバーの横スクロールとno-scrollbar、モーダル制御を維持 |
| `src/hooks/useTimer.ts` | 25/5分、deadline、通常・デバッグ供給、モード遷移 | Pauseと供給停止の連動、完了時コールバック順を維持 |
| `src/hooks/useDebugMode.ts` | URL、公開環境変数、NODE_ENVから統合デバッグモードを判定 | 厳密な`debug === "true"`、SSR安全性、localStorage非使用を維持 |
| `src/constants/assets.ts` | 確率、間隔、物理設定、保存キー、SVG Path、初期State | 数値変更はゲームバランスと永続化互換性へ直結 |
| `src/types/game.ts` | Canvas Props/Handle、Body plugin、各イベント、Shop/Ad型 | Runtimeのイベントオブジェクト構造と一致させる |

### 4.2 補助ファイル

| ファイル | 責務 |
| --- | --- |
| `src/app/layout.tsx` | Metadata、Analytics、Speed Insights、全ページ共通Privacy Footer |
| `src/app/globals.css` | Tailwind読込、全画面overflow制御、button cursor、no-scrollbar |
| `src/app/privacy/page.tsx` | AdSense審査向けプライバシーポリシー |
| `src/components/ShopModal.tsx` | Shopの表示、標高3,000mによるBalloon/Rocket文言切替、購入UI |
| `src/components/AdContainer.tsx` | Desktop/Mobile広告プレースホルダー、30秒refresh state |
| `src/hooks/useGameStorage.ts` | localStorageの検証付き読込・保存、カメラ状態API |
| `src/utils/canvasRenderer.ts` | Tomatoおよび全CarrierのCanvas描画、SVG Path2D、Satellite電波 |
| `src/utils/physicsSafety.ts` | めり込み30%補正、有限数検査、速度30超から25へのクランプ |
| `src/utils/terrainUtils.ts` | 中央Core範囲、可視Body抽出、Compound Terrainパーツ生成 |
| `src/utils/gameUtils.ts` | clamp、smoothStep、色補間、空色、診断種別、バフ時間整形 |
| `src/lib/config.ts` | タイマー時間、供給間隔、基本World寸法などのアプリ設定 |
| `next.config.ts` | 開発オリジン許可 |

### 4.3 コンポーネント間のデータフロー

```text
page.tsx
├─ useTimer
│  └─ awardTomato() ──> PhysicsCanvas.drop(golden)
├─ useGameStorage
│  └─ counts / currency / buffs / unlocks / altitude を永続化
├─ PhysicsCanvas
│  ├─ onBonusTomato() ──> 論理獲得数更新
│  ├─ onGoldenTomatoDrop() ──> 所持Gold・累計Gold更新
│  └─ onAltitudeChange() ──> 現在標高・最高標高更新
├─ ShopModal
│  └─ 購入時 PhysicsCanvas.removeGolden(count)
└─ AdContainer (mobile / desktop)
```

### 4.4 `PhysicsCanvas` 公開APIと主要Props

- Imperative Handle:
  - `drop(golden: boolean)`: 現在高度の供給キャリアを開始または特殊イベント中のキューへ追加。
  - `removeGolden(count: number)`: World上のGold Bodyを上側から削除し、実削除数を返す。
- ゲーム状態PropsはMatter.jsのメインEffectを再作成せず、Refへ同期して長寿命RAFから参照する。
- Matter.js初期化Effectの依存配列は `[hydrated]` のみ。State変化ごとにEngineを再生成しない。

### 4.5 既知の未使用・限定使用項目

現在の挙動を誤認しないため、以下を明示する。

- `useTimer.autoLoopEnabled` / `autoLoopRef` はUI状態の保持のみで、完了遷移の条件には未使用。
- `CONFIG.world.initialCameraScale`、`CONFIG.maxRestoredBodies`、`CONFIG.goldenChance` は現在の主要ロジックでは未使用。
- `PhysicsCanvasProps.counts` は渡されるが、Body復元や描画には未使用。
- `UnlockedItems.bird` / `balloon` は保存可能だが、現在のShopに購入UIはなく、通常キャリアの発生条件にも使われない。
- 広告枠はプレースホルダーであり、Google AdSenseスクリプトや広告unit IDはまだ組み込まれていない。

## 5. 変更時チェックリスト

- `npx tsc --noEmit` が成功すること。
- `npm run build` で `/`、`/privacy` が生成されること。
- Focus/Break/Pause/Reset/Spaceキー、Reward分岐、Bonus Break終了リセットを確認すること。
- Matter.jsがタイマー停止中とページ非表示中にも更新されること。
- 320px程度の狭い画面でツールバーが親幅を押し広げず、横スワイプでき、スクロールバーが見えないこと。
- Desktop広告が右側300〜336px、Mobile広告が高さ50pxで、Canvas開始位置が7.75remであること。
- Privacyリンクが画面左下、標高が右下で重ならないこと。
- 通常、Bonus、Gold Boostの色・サイズ独立抽選を確認すること。
- 3,000m、5,000m、10,000mのイベント境界と45秒／15秒切替を確認すること。
- デバッグOFFでZap・UFO・10秒・診断ログ／表示が無効、デバッグONで従来機能が有効になること。物理診断の安全処理は常時動作すること。
- Deep Coreの中央限定Static化、側面Dynamic、Terrain吸収の絶対Y基準を確認すること。
- localStorage破損値でクラッシュせず、安全な初期値へ戻ること。
