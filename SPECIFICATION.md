# プロジェクト仕様書

最終コード確認日: 2026-09-19

本書は、PomoTM / Tomato Focus の現在のリポジトリ実装を将来の開発者およびAIへ共有し、デグレードや過去仕様への先祖返りを防止するための基準文書である。会話履歴や過去の要件ではなく、現在のソースコードを正として記載している。

## 0. 仕様保護の原則

- Matter.js の物理ステップ、イベント配列、Body管理Set、描画順、カメラ更新順は相互依存している。`PhysicsCanvas.tsx` を変更する場合は、単独の処理だけを見て順序を変えてはならない。
- `Matter.Engine.update(engine, safeDelta)` はタイマーの再生・停止とは独立して毎フレーム実行する。ページが非表示の場合も、`Engine.update` 実行後に描画処理をスキップする順序を維持する。
- 現在の物理デルタ上限は `16.666ms` である。過去資料にある `33.33ms` へ戻してはならない。
- タイマー・React Stateの最新値は、長寿命なMatter.js描画クロージャへ `Ref` 経由で渡している。この同期構造を通常のクロージャ参照へ安易に置換しない。
- 個別トマトの座標は永続化しない。保存・復元対象はカウント、所持金、アイテム所持数、バフ、アンロック、最高標高、カメラ状態である。
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

#### SEOメタデータ

- Root LayoutのMetadataで、PomoTMを「トマトが積み上がるポモドーロタイマー」「勉強・作業用タイマー」として案内する。
- 検索キーワードは「ポモドーロタイマー」「勉強タイマー」「30分タイマー」「作業用タイマー」「集中タイマー」「トマトタイマー」「ゲーミフィケーション」「Webタイマー」を設定する。
- Open Graphは `website`、`ja_JP`、サイト名 `PomoTM`。Twitter Cardは `summary_large_image` とし、両方に日本語タイトルと説明文を設定する。

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
- 自動切替が無効な場合は `page.tsx` 側が集中完了を検知してリワードモーダルを開き、直後に休憩タイマーを一時停止する。休憩完了時は集中モードへ戻し、25分に設定して停止する。
- 自動切替が有効かつ権限フラグ `canUseAutoSwitch` が有効な場合は、動画選択を挟まずFocusからBreakへ、BreakからFocusへ再生状態のまま連続遷移する。Focusへ戻る際は通常供給とデバッグ供給のスケジュールも再開する。
- `canUseAutoSwitch` が無効になった場合は自動切替StateとRefを即座にOFFへ戻し、UI操作を無効化する。現在の既定権限は `true`。
- Spaceキーは再生／一時停止を切り替える。キーリピート中、リワードモーダル表示中、動画再生中、入力要素・選択要素・ボタン・contenteditableにフォーカス中は無効。アイテムトーストは操作を遮らない。
- ブラウザタイトルは `MM:SS · 集中` または `MM:SS · 休憩` に更新する。

### 1.3 リワード動画とボーナス休憩

- 集中完了後にリワードモーダルを表示する。
- 集中完了時にDouble Drop 40%、Balloon / Rocket Boost 40%、Gold Boost 20%の1回抽選を行い、その結果を保留中の報酬として固定する。
- 「動画を見てボーナス獲得」は5秒の疑似動画カウントダウンを開始する。
- 動画完了後は `isBonusBreakMode = true`、スキップ時は `false` とし、どちらも広告選択モーダルを閉じて休憩タイマーを再開し、アイテム獲得トーストを表示する。
- トースト表示時に保留中のアイテムをインベントリへ1回だけ加算する。`pendingItemRewardRef` と `itemRewardGrantedRef` で抽選結果を固定し、二重付与を防ぐ。
- アイテムトーストはアイテム名・Lucideピクトグラム・効果説明を即時表示し、1.5秒後にフェードを開始して2秒後に自動で閉じる。手動の開封・受取操作は持たない。
- ボーナス休憩中かつ休憩タイマー再生中は、1.5秒間隔でトマトを供給する。
- ボーナス状態は、休憩完了、残り0、モード切替、リセット、集中モードへの遷移時に消去する。
- リワード動画・アイテムトースト表示中もMatter.jsの `Engine.update` は停止しない。

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
- 通常床と左右壁は可視領域より左右500px相当、下方向300px相当の予備領域を持つ。床上面はCanvas下端に維持し、床本体は下方向へ厚く拡張する。Terrainの下端と初期横幅にも同じ予備領域を含める。

### 1.9 カメラ、再開、背景

- 通常起動時のカメラRef初期値は1.0。`CONFIG.world.initialCameraScale = 0.88` は現在参照されていない。
- 動的ズーム下限は `MIN_DYNAMIC_CAMERA_SCALE = 0.20`。
- 山が左右10%の安全域または画面高さ48%の安全ラインを越えると、必要スケールと上方向オフセットを計算し、係数0.03で追従する。
- 標高は、静止済み・Sleeping・生成後2秒以上かつ低速のトマトとアーカイブTerrainの最高点から算出する。換算は概ねCanvas上の2px = 1m。
- 最高標高が保存済みの再開時は、ズームを0.48へ固定し、保存カメラYまたは `initialMaxAltitude * 2` を復元する。
- 再開時は個別トマトを復元せず、画面下部に重なり合う円形Static BodyのCloud Floorを1つのCompound Bodyとして生成し、トマト0個の物理Worldから再開する。
- Cloud Floorは見た目と当たり判定を同じ円群から描画し、長方形の白線は描かない。左右から落ちて床下300px相当を越えたBodyを削除する。
- Cloud Floorの表面は左右500px相当まで円群を延長し、描画しない下部支持Bodyを300px相当確保する。表示する雲グラフィックは従来どおり表面の円群のみとする。
- ResizeObserverによるサイズ変更時は、変更前後の通常床またはCloud Floor上面のY差分を算出し、World内の全トマトBodyを `Body.setPosition(body, nextPosition)` で同じ差分だけ移動する。速度・Force・Sleep状態は変更せず、Sleeping描画キャッシュと積載上端だけを更新する。
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

猫ドロップ演出:

- 通常供給開始時に、通常は1/1,000、統合デバッグモード時は1/100で猫ドロップを一度だけ抽選し、結果をその供給の単一フラグとして使用する。猫が当選した場合はBalloon分岐より猫を優先し、高度に応じたBird、Plane、Satelliteが猫だけを運ぶ。
- 猫キャリアの運搬中および猫の落下中は、通常キャリア、Balloon、Rocket、UFO、Space Octopusを含む全投下経路でトマトMatter Body生成、Gold獲得コールバック、Double Dropによる追加生成を行わない。停止中の連続投下時刻は現在時刻基準へ送り、猫終了後の蓄積一括投下を防止する。
- 猫は通常トマト直径の3.0〜4.5倍（従来設定の2倍）。提示された2つのSVGフレームを90ms間隔で切り替え、運搬・落下・着地走行の全フェーズで同一サイズを描画と表面判定に使用する。キャリア保持中は短い保持線とともに描画する。
- 投下後の猫はMatter Bodyではない軽量な演出イベントである。既存トマト円、通常床、再開時Cloud Floor、Terrainの表面位置を読み取り専用で調べて着地する。
- 着地後は15〜20秒の散歩フェーズへ入り、左右それぞれ画面内側12.5%の境界へ近づくと自動でUターンする。2〜4秒ごとの進路判定ではY座標が大きい画面下側・低標高方向を70%優先しつつ、気まぐれな方向転換も行う。散歩速度は画面上で約70px/秒相当とする。
- 急な段差や深いくぼみでもX方向の一定歩行を停止せず、足元Yだけを広い探索範囲で見つけたトマト・床・Cloud Floor・Terrainの最高表面へ滑らかに補間する。表面を一時的に検出できない区間でもX移動を継続しながらYを下降させる。
- 散歩時間終了後は現在位置から近い左右の画面端へ進行方向を固定し、画面上で約160px/秒相当の速度で表面追従を続けたまま画面外へ退場する。画面内では透明度を常に100%に維持し、猫全体が可視境界からさらに100px外側へ到達した時点だけ演出配列から削除する。歩行・進路選択・表面追従は猫の表示座標だけを更新し、トマトへForce・速度変更・Sleep解除を一切適用しない。
- 標高とカメラの算出対象は `activeBodies`、`sleepingBodies`、アーカイブTerrainのトマト境界だけであり、`catEvents` の座標は参照しない。高度計算用Setへ非トマトBodyが混入した場合は `[CatDiagnostic]` を出力する。
- 猫表面探索では、読み取り前後のトマトBody位置・速度・Force・Sleep状態を比較し、通常時／統合デバッグ時を問わず変更が検出された場合のみ `[CatDiagnostic]` エラーを出力する。比較処理自体はBodyを変更しない。
- 猫の位置・落下速度・サイズ・カメラ境界のNaN／Infinity、可視領域から極端に離れた座標、異常速度を毎フレーム検査し、異常時だけ2秒間隔で抑制された警告またはエラーを出力する。
- 可視範囲の左右外、または下方クリーンアップ線を越えた猫は演出配列から削除する。Matter Worldへ猫Bodyは追加しない。
- 猫色はFocusテーマで白、Breakテーマで黒へ反転する。

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
  5. 果汁、飛行機雲、落下・走行中の猫、キャリア、UFO、Octopus、Alien。
  6. 物理異常診断オーバーレイ。
- SleepingトマトはオフスクリーンCanvasへまとめ、最低500ms間隔または強制dirty時に再構築する。
- トマト画像URLが空の場合はCanvas図形で描画する。赤／金のマットな円、輪郭、5枚の緑色ヘタを描く。表面ハイライトは描かない。
- 完熟度は約700msで通常赤から濃い赤へ補間する。
- Birdが運搬中のトマト、各キャリア投下前のトマト、物理Bodyのトマトは同じ `drawTomato` を使用する。
- 猫の2コマPath2Dはキャリアより背面、トマトより前面に描画する。猫の表面追従判定はBodyを読み取るだけで、MatterイベントやBody管理Setを変更しない。

### 1.12 ショップ、通貨、バフ

- 通貨は所持Goldトマト。金トマトが物理Worldへ生成された時に加算する。
- 3種の消費型バフはGold交換ではなく、集中完了報酬で獲得した所持アイテムを1個消費して有効化する。
- UFOおよびSpace Octopusの永久解放では従来どおりGoldを消費する。消費時は通貨と論理カウントを減らし、物理World上のGold Bodyを山の上側（`bounds.min.y` が小さい順）から消費数まで削除する。World上のGoldが不足してもエラーにしない。
- バフ時間は各30分。Focusかつタイマー再生中のみ1秒ずつ減算し、休憩中は減算しない。

| アイテム | 集中完了時の獲得率 | 使用条件・効果 |
| --- | ---: | --- |
| Double Drop | 40% | 所持数を1消費し、対応する1回の供給数を30分間2個へ増加 |
| Balloon / Rocket Boost | 40% | 所持数を1消費。高度3,000m未満では気球、高度3,000m以上ではロケットの確率を30分間2倍。UI文言だけ高度で切替、内部Stateは共通 `balloonBoost` |
| Gold Boost | 20% | 所持数を1消費し、通常／ボーナスのGold率を30分間2倍 |

| 永久解放 | Goldコスト | 効果 |
| --- | ---: | --- |
| UFO永久解放 | 100 Gold | UFOイベントを有効化 |
| Space Octopus永久解放 | 1,000 Gold | 宇宙タコイベントを有効化 |

- Shopは3種の所持数をLucideアイコンと `× 数量` で表示する。未発動かつ所持数1以上の場合だけ使用でき、使用時に1個減算する。
- 有効なバフは使用ボタン内部を残り時間 `MM:SS` 表示へ切り替え、押下不可にする。`ACTIVE` 表記およびボタン下の別行時間表示は使用しない。
- Shop上部では所持Gold数を表示せず、UFO永久解放とSpace Octopus永久解放だけを同じ高さ・同じ幅のコンパクトボタンとして折り返さず横一列に表示する。Space Octopusは未解放時に1,000 Goldで解除でき、解放後は「宇宙タコ解除済み」と表示する。解除可否の内部判定には既存の所持Gold Stateを引き続き使用する。
- Space Octopusの説明付き大型カードは表示せず、永久解放操作を上部ステータス列へ集約する。
- ショップ末尾には「※休憩中はアイテムの減算は行われません。」を1回だけ表示する。

### 1.13 永続化

| キー | 内容 |
| --- | --- |
| `tomato-focus:v1` | 論理獲得数 `{ normal, gold }` |
| `tomato-focus:progress:v1` | 所持Gold、3種のアイテム所持数、バフ状態・残時間、アンロック状態 |
| `pomo_unlocked_items` | UFO / Octopus永久解放 |
| `pomo_max_altitude` | 最高標高 |
| `pomo_total_gold_tomatoes` | 累計Gold獲得数 |
| `pomo_unlocked_events` | アンロックイベント一式 |
| `pomo_saved_camera` | `{ scale, offsetY }` |

- 保存値は有限数・非負整数・上限50,000などを検証し、不正な値は破棄または0へ戻す。
- `counts` は親Stateと保存には使用され、`PhysicsCanvas` にPropsとして渡されるが、現在はBody復元には使用されていない。
- `CONFIG.maxRestoredBodies = 80` は現在参照されていない。

### 1.14 PWA・インストール誘導

- `/manifest.webmanifest` はMetadata Routeの `src/app/manifest.ts` から生成する。アプリ名は「PomoTM - トマトポモドーロタイマー」、表示モードは `standalone`、背景色とテーマ色は `#0f172a`。
- 公式アイコンの原本は `assets/icon/180TMicon.png`、`assets/icon/192TMicon.png`、`assets/icon/512TMicon.png`。配信用コピーは同名で `public/icons/` に置く。
- ManifestはPNGの192px／512pxアイコンを `/icons/192TMicon.png` と `/icons/512TMicon.png` から参照する。Root Layoutの通常アイコンも同じ192px／512pxを使用し、Apple Touch Iconには `/icons/180TMicon.png` を使用する。
- 旧アイコンファイルとその参照は保持しない。アイコン差替え時は原本・配信用コピー・Metadata・Manifestを同時に更新する。
- Root LayoutはViewport Metadataで `themeColor: #0f172a` と `viewportFit: cover` を設定し、Apple Web Appのcapable、black-translucent status bar、タイトルを設定する。
- `PWAInstallPrompt` は `beforeinstallprompt` が発火し、スタンドアロン起動ではなく、7日間の非表示期間中でもない場合だけ表示する。インストール操作では保存したイベントの `prompt()` を呼び、`appinstalled` 後は閉じる。
- 「後で」または閉じる操作はlocalStorageの `pomotm:pwa-install-dismissed-until` に7日後の期限を保存する。localStorageが使用不能でもクラッシュさせない。
- 誘導UIは画面下部の `z-[80]` に表示し、ゲーム・広告・モーダルのStateやMatter.js処理には依存しない。

### 1.15 ゲーム音声

- 音声原本は `assets/audio/`、Web配信用コピーは `public/audio/` に置き、`/audio/...` の絶対パスで参照する。
- 通常・中・Gold・Tinyを含む非Giantトマトの初回接地音は `/audio/tomato_sound.mp3`、半径比2以上のGiantは `/audio/giant_tomato_sound.mp3` を使用する。
- 各トマトBodyの `plugin.tomato.hasPlayedLandSound` により、床、雲床、Terrain、下側のトマトへ初めて接地した `collisionStart` でだけ再生対象にする。`collisionActive` では再生しない。
- 着地音は各種3個のAudioプール、通常0.2／Giant 0.3の音量、通常70ms／Giant 110msのクールダウンを使用し、同一フレームの大量衝突でAudio要素を無制限生成しない。
- `/audio/ailian.mp3` はUFOまたはSpace Alienが画面内に1体以上存在する間だけ音量0.18・loopで再生する。両イベントの退場、ページ非表示、PhysicsCanvasのアンマウント時にpauseし、再生位置を0へ戻す。Space Octopus単独では再生しない。
- ブラウザの自動再生制限に従い、windowの初回pointerdownまたはkeydown後だけ再生する。すべての `play()` Promise拒否は捕捉し、ゲームループへ例外を伝播させない。

### 1.16 Cloudflare D1データモデル

- サーバー永続化の正規スキーマはルートの `schema.sql`。Cloudflare D1 / SQLiteを対象とし、外部キーを有効化する。
- 日時はUTCのISO-8601文字列、真偽値はSQLite整数 `0 | 1` で保存する。`src/types/db.ts` の `DatabaseDateTime` / `DatabaseBoolean` と一致させる。
- `users` はメール認証用 `password_hash`、課金状態 `is_premium`、期限 `premium_until`、ゲストデータ移行用 `guest_id` を保持する。メールまたはguest IDのどちらかを必須とし、guest IDとメールは重複させない。
- `accounts` はOAuth等の外部アカウントを管理し、providerとprovider側IDの組を一意にする。`sessions` はCookie用tokenと期限を管理する。
- `rankings` は非負scoreを保持し、ユーザー削除時も表示名とscoreを残してuser参照だけをNULLにする。
- `user_items` はユーザー・itemごとに一意で、消費型の `quantity`、バフ期限 `active_until`、永久解放用 `is_unlocked` / `unlocked_at` を同時に管理する。quantityを負数にしない。
- `subscriptions` はStripe等のprovider、決済status、customer／price ID、期間、期末解約、キャンセル日時を保持する。ユーザー削除時は関連行も削除する。
- `src/types/db.ts` は全6テーブルの行型、Insert/Update型、Subscription status unionを提供する。`isUserPremium()` はフラグに加えて期限切れも検査し、期限NULLの有効フラグは無期限として扱う。
- `schema.sql` は新規DB構築用の正規定義であり、既存の本番D1へ推測で適用しない。既存テーブルへ反映する場合は、本番schemaを取得して差分マイグレーションを別途作成・レビューしてから実行する。

### 1.17 Cloudflare静的Assetsデプロイ

- Cloudflareへの本番配備方式はNext.js static exportとし、`next.config.ts`の `output: "export"` により `npm run build` がルートの `out` ディレクトリを生成する。
- Cloudflare AssetsではNext.js Image Optimization serverを使用しないため、`next.config.ts`の `images.unoptimized` をtrueに固定する。
- 正規のCloudflare設定はルートの `wrangler.json`。Worker名は `pomo-tm`、compatibility dateは `2026-09-21`、assets directoryは `./out` とする。静的assets-only配備のためWorker scriptの `main` は指定しない。
- Metadata Routeの `/manifest.webmanifest` は `src/app/manifest.ts` の `dynamic = "force-static"` により静的export対象とする。
- `npm run deploy` は先に `npm run build`を完了し、その後 `wrangler deploy --config wrangler.json` を実行する。Wranglerを直接実行する場合も `wrangler.json` を明示し、旧OpenNext設定を参照させない。
- 現在のクライアントアプリは静的export可能な構成を維持する。Server Actions、リクエスト依存の動的Route Handler、SSR必須APIを追加する場合は、静的配備との互換性を事前に再評価する。

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
  - Settings Modal: `z-[70]`。
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
- 右グループ: Play、Pause、Reset、Repeat、Shop、Settings、Gold所持数。統合デバッグモード時のみZap、UFOデバッグ、猫デバッグ、10sを追加表示する。
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

### 2.6 法務リンクの配置

- Homeのゲームカードには利用規約・プライバシーポリシーへのリンクを表示しない。旧左下プライバシーポリシーリンクは削除済みとする。
- UI上の法務導線はSettings Modal最下部の控えめなTerms / Privacyリンクへ一本化する。
- AdSense・OAuth審査および直接参照用の公開 `/privacy` ページは維持するが、Home画面には重複リンクを戻さない。

### 2.7 プライバシーポリシーページ

- `/privacy` はServer Componentで、独自に `h-[100dvh] overflow-y-auto` を持つ。グローバルbodyのoverflow hidden下でも縦スクロール可能。
- 最大幅3xlのレスポンシブカード。
- Google AdSense / Cookie、Googleポリシー外部リンク、Vercel Analytics / Speed Insights、免責事項、トップへ戻るリンクを含む。
- 外部Googleリンクは別タブで開き、`noopener noreferrer` を付与する。

### 2.8 Shop / Reward Modal

- Shopはカード全体を覆う絶対配置。背景クリックで閉じ、ダイアログ内のmousedownは伝播停止。
- Shopカードは最大lg。上部ステータス列にはUFO解放・Octopus解放だけを同一ラインで表示し、その下に3種アイテムの所持数・使用操作・バフ残り時間を表示する。Shop内では所持Goldバッジを表示しない。消費アイテム発動中は使用ボタン自体が `MM:SS` 表示となり、追加の時間行やOctopus大型カードは持たない。
- Reward選択はShopより前の `z-[60]`、最大md。疑似動画中は5秒カウントを表示する。アイテム獲得時は同じレイヤーの操作非遮断トーストへ切り替わり、自動でフェードアウトする。
- Break時はアプリ、カード、ボタン、モーダル、Canvas背景を明るいテーマへ遷移する。既存実装には休憩アクセントとしてemerald色が存在する。

### 2.9 言語設定 / Settings Modal

- ヘッダーツールバーのLucide `Settings` 歯車ボタンから設定モーダルを開く。
- 設定モーダルでは `日本語`（`ja`）と `English`（`en`）をラジオボタンで選択し、選択直後にヘッダー、ページタイトル、Shop、Settings内のTerms / Privacyリンクと法務本文を切り替える。
- 言語Stateは `page.tsx` が所有し、`src/utils/translations.ts` の辞書を参照する。Shopは `language` Propsを受け取り、購入・使用・アンロック処理を変更せず表示文言だけを切り替える。
- 選択言語はlocalStorageキー `pomotm_lang` に `ja` または `en` として保存する。不明値、破損値、localStorage利用不能時は日本語を安全な既定値とする。
- 言語変更時はルート要素の `lang` 属性も同じ値へ同期する。
- Settings Modalはカード全体を覆う `z-[70]`。背景クリックまたは閉じるボタンで閉じ、Focus/Breakテーマを継承する。
- Settings Modal最下部には、抑えたグレーの小文字で「利用規約 | プライバシーポリシー」または英語表記を横並びに表示する。各リンクはページ遷移せず、Settingsより前面のスクロール可能な法務モーダルを開く。

### 2.10 ゲスト利用とアカウント認証

- アプリは常にゲスト利用を既定とし、起動時や通常操作時に認証モーダルを自動表示しない。未ログインでもタイマー、物理ゲーム、アイテム、設定などの基本機能を制限しない。
- Settings Modal内のアカウント設定からだけ認証モーダルを開く。未ログイン時は「ログイン / アカウント作成」、ログイン時はメールアドレス・表示名とログアウト操作を表示する。
- `AuthModal` は設定画面の上に `z-[80]` で重なり、Firebase AuthenticationによるGoogleポップアップ認証、メール／パスワードのログイン・新規登録タブ、後で閉じる操作を提供する。閉じた場合は元の設定画面へ戻る。
- Googleログインは `signInWithPopup(auth, googleProvider)` を使用する。ページ遷移や独自 `/api/auth` Routeを使用せず、成功時はFirebaseの認証Stateへ即時反映してモーダルを閉じる。
- メールログインは `signInWithEmailAndPassword()`、新規登録は `createUserWithEmailAndPassword()` を使用する。登録直後に `updateProfile()` で1〜80文字の表示名を保存する。
- メール新規登録後は `sendEmailVerification()` で確認メールを送り、案内を表示して即座に `signOut(auth)` する。確認リンクを開くまでログイン済みUIへ遷移させない。
- メールログイン成功後も `user.emailVerified` を検査し、未確認なら案内と再送ボタンを表示して即座にサインアウトする。再送時は入力済み資格情報で一時的に再認証し、メール送信後に再びサインアウトする。
- 確認メール再送は成功後60秒間無効化し、残り秒数をボタン内に表示する。Googleポップアップ認証はメール確認判定の対象外とする。
- Settings Modalは `onAuthStateChanged()` を購読し、Firebase `User` の表示名・メール・プロフィール画像を描画する。password providerの未確認ユーザーは表示対象から除外し、ログアウトは `signOut(auth)` を実行する。
- Firebaseの永続セッションはWeb SDKへ委譲する。認証情報、パスワード、ID tokenをアプリ独自のlocalStorageへ保存しない。
- Firebase設定はすべて `NEXT_PUBLIC_FIREBASE_*` 環境変数から読み、コードへ実値を埋め込まない。未設定時に疑似ユーザーを生成しない。
- Firebase Web Appは `getApps()[0]` があれば再利用し、存在しない場合だけ `initializeApp()` を実行する。Google Providerのブラウザ固有設定は `window` が存在する場合だけ適用する。
- Firebase Admin SDKはクライアントbundleへ含めない。認証状態監視とログイン操作はClient ComponentのEffectまたはユーザー操作からのみ開始し、静的build中には実行しない。

### 2.11 利用規約・プライバシーポリシーモーダル

- `TermsModal` と `PrivacyModal` はSettings Modalからだけ開き、`z-[90]` でSettingsより前面に表示する。背景クリック、右上の閉じるアイコン、下部の閉じるボタンでSettingsへ戻る。
- モーダルカードは `max-w-2xl`、viewport内の最大高を持ち、長文部分だけを縦スクロールさせる。Focus/Breakテーマ、スマートフォン幅、日本語／英語切替を継承する。
- 利用規約はサービス目的、アカウント管理、禁止事項、知的財産、サービス変更・停止、免責・責任制限、規約変更を含む。
- プライバシーポリシーはFirebase/Googleプロフィール情報、メール確認状態、localStorage、将来のCloudflare D1・課金状態、技術情報、利用目的、委託先、第三者提供制限、安全管理、保存期間、削除、未成年者、変更方針を含む。
- Googleのパスワード、決済カード番号、Firebase ID tokenをアプリ独自に保存しないことを明記する。実在しない運営者名・連絡先・保証を記載しない。

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

### 3.3 猫デバッグ

- 上部ツールバーでUFOデバッグボタンの隣に表示するCatアイコン。統合デバッグモード時のみ表示する。
- React State `debugCatMode` を `PhysicsCanvas` の `debugCatModeRef` へ同期する。
- ON時は通常供給の猫フラグを100%成立させ、Balloon分岐を使用せずBird、Plane、Satelliteから猫を単独ドロップする。モード中は全経路のトマトMatter Body生成を入口でも遮断する。
- OFF時は既存の抽選を維持し、通常環境は1/1,000、統合デバッグ環境は1/100で猫の単独ドロップへ切り替える。
- 猫デバッグとUFOデバッグは排他的に動作する。一方をONにすると他方をOFFにし、通常キャリアが停止するUFOデバッグ中に猫の検証経路が失われることを防ぐ。
- 統合デバッグモードがOFFになった場合、`debugCatMode` と `debugUfoMode` をともにOFFへ戻す。デバッグON/OFF状態は永続化しない。

### 3.4 10秒タイマースキップ

- 統合デバッグモード時のみツールバーへ表示する。
- FastForwardアイコンと `10s` 表記。
- 押下時、現在の残り時間を10秒へ設定し、再生中ならdeadlineも更新する。
- 本番ビルドでは描画しない。

### 3.5 物理診断ログと画面オーバーレイ

- NaN・Infinity検出、速度クランプ、異常Body除去は統合デバッグモードに関係なく常時有効。
- `beforeUpdate` / `afterUpdate` でNaN・Infinityを検出した時に、安全処理は常に発火する。
- 同一reason/body IDのログは2秒以内の重複出力を抑制する。
- 猫関連の診断は `[CatDiagnostic]` として、標高の1フレーム10,000m以上の変化、カメラYの10,000以上の変化、非有限値、猫運動値の異常、表面読み取り中のBody変更を記録する。診断ログは状態を補正・停止せず観測のみ行う。
- 統合デバッグモード時のみ、`console.error("[PhysicsDiagnostic]", ...)` へ原因、phase、Body詳細、Body数、カメラ、全トマトスナップショットを出力する。
- 統合デバッグモード時のみ、Canvas左上付近 `(12, 76)` に赤い `PHYSICS ANOMALY DETECTED` オーバーレイを描く。
- アラートは再代入またはコンポーネント再初期化まで保持され、自動消去タイマーはない。
- 異常Bodyのみを除去し、World全体やエンジンは停止しない。

### 3.6 その他の可視ステータス

- 右下に現在標高を常時表示する。
- Shopに各アイテムの所持数、各バフのボタン内残り時間、永久解放状態を表示する。所持Goldはメイン画面の上部ツールバーだけに表示する。
- Reward疑似動画中は残り秒を大きく表示する。
- Adプレースホルダーは `data-ad-refresh` に30秒更新カウントを持つが、画面には数値表示しない。

### 3.7 統合デバッグモード

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
| `src/app/page.tsx` | 全画面UI、React State、タイマー接続、Reward、アイテム付与・使用、永久解放購入、Gold通貨、認証モーダル開閉、Spaceキー、広告配置 | z-index、モバイルCanvas top 7.75rem、ツールバーの横スクロールとno-scrollbar、標高バッジ、モーダル制御を維持 |
| `src/hooks/useTimer.ts` | 25/5分、deadline、通常・デバッグ供給、モード遷移 | Pauseと供給停止の連動、完了時コールバック順を維持 |
| `src/hooks/useDebugMode.ts` | URL、公開環境変数、NODE_ENVから統合デバッグモードを判定 | 厳密な`debug === "true"`、SSR安全性、localStorage非使用を維持 |
| `src/constants/assets.ts` | 確率、間隔、物理設定、保存キー、SVG Path、初期State | 数値変更はゲームバランスと永続化互換性へ直結 |
| `src/types/game.ts` | Canvas Props/Handle、Body plugin、各イベント、Shop/Ad型 | Runtimeのイベントオブジェクト構造と一致させる |

### 4.2 補助ファイル

| ファイル | 責務 |
| --- | --- |
| `src/app/layout.tsx` | SEO Metadata、Open Graph、Twitter Card、AdSenseスクリプト、全ページ共通HTML構造 |
| `src/app/manifest.ts` | PWA Manifest Metadata Route、standalone表示、テーマ色、アプリアイコン定義 |
| `src/app/globals.css` | Tailwind読込、全画面overflow制御、button cursor、no-scrollbar |
| `src/app/privacy/page.tsx` | AdSense審査向けプライバシーポリシー |
| `src/components/ShopModal.tsx` | Shopの表示、標高3,000mによるBalloon/Rocket文言切替、消費型アイテムの所持数・使用UI、永久解放購入UI |
| `src/components/SettingsModal.tsx` | 日本語／英語の選択UI、Firebase `onAuthStateChanged` 購読、ゲスト／ログイン済みアカウント表示、Googleプロフィール画像、Firebaseログアウト導線、Focus/Breakテーマ対応 |
| `src/components/AuthModal.tsx` | Firebase Googleポップアップ認証、メール／パスワードのログイン・新規登録、表示名更新、認証中・エラー表示 |
| `src/components/TermsModal.tsx` | 日英利用規約のスクロール表示、Settingsへ戻る閉じる操作、Focus/Breakテーマ対応 |
| `src/components/PrivacyModal.tsx` | 日英プライバシーポリシーのスクロール表示、Settingsへ戻る閉じる操作、Focus/Breakテーマ対応 |
| `src/components/RewardModal.tsx` | 疑似リワード動画UI、自動フェードする獲得アイテムトースト |
| `src/components/PWAInstallPrompt.tsx` | beforeinstallprompt保持、スタンドアロン判定、7日間の再表示抑制、インストール誘導UI |
| `src/components/AdContainer.tsx` | Desktop/Mobile広告プレースホルダー、30秒refresh state |
| `src/hooks/useGameStorage.ts` | localStorageの検証付き読込・保存、カメラ状態API |
| `src/utils/canvasRenderer.ts` | Tomatoおよび全CarrierのCanvas描画、SVG Path2D、Satellite電波 |
| `src/utils/physicsSafety.ts` | めり込み30%補正、有限数検査、速度30超から25へのクランプ |
| `src/utils/terrainUtils.ts` | 中央Core範囲、可視Body抽出、Compound Terrainパーツ生成 |
| `src/utils/gameUtils.ts` | clamp、smoothStep、色補間、空色、診断種別、バフ時間整形 |
| `src/utils/translations.ts` | `ja` / `en` の対訳辞書、利用規約・プライバシーポリシー本文、言語型、`pomotm_lang` 保存キー、保存値検証 |
| `src/lib/config.ts` | タイマー時間、供給間隔、基本World寸法などのアプリ設定 |
| `src/lib/firebase.ts` | Firebase Web SDKの単一初期化、Firebase AuthおよびGoogleAuthProviderのexport、環境変数参照 |
| `src/types/db.ts` | D1のusers/accounts/sessions/rankings/user_items/subscriptions行型、書込型、プレミアム判定ヘルパー |
| `schema.sql` | Cloudflare D1の正規スキーマ、外部キー・一意制約・CHECK制約・検索インデックス |
| `.env.example` | Firebase Web Appの `NEXT_PUBLIC_FIREBASE_*` 環境変数例。実プロジェクト値は環境ごとに設定する |
| `next.config.ts` | 開発オリジン許可、`output: "export"` による静的 `out` 生成 |
| `wrangler.json` | `pomo-tm` の静的Assets設定。配信元は `./out` |
| `package.json` | Next.js static build後に `wrangler.json` を明示してdeployする実行順序 |

### 4.3 コンポーネント間のデータフロー

```text
page.tsx
├─ useTimer
│  └─ awardTomato() ──> PhysicsCanvas.drop(golden)
├─ useGameStorage
│  └─ counts / currency / item inventory / buffs / unlocks / altitude を永続化
├─ PhysicsCanvas
│  ├─ onBonusTomato() ──> 論理獲得数更新
│  ├─ onGoldenTomatoDrop() ──> 所持Gold・累計Gold更新
│  └─ onAltitudeChange() ──> 現在標高・最高標高更新
├─ ShopModal
│  ├─ 消費型アイテム使用時に所持数を1減らして30分バフを開始
│  └─ 永久解放購入時のみ PhysicsCanvas.removeGolden(count)
├─ SettingsModal
│  ├─ 言語選択 ──> page.tsxのlanguage State更新 ──> pomotm_lang保存・UI即時更新
│  └─ onAuthStateChanged ──> Firebase User表示 / signOut(auth)
├─ AuthModal
│  ├─ Google ──> signInWithPopup ──> Firebase Authentication
│  ├─ 新規登録 ──> createUserWithEmailAndPassword ──> updateProfile
│  └─ Email login ──> signInWithEmailAndPassword ──> Firebase Authentication
├─ RewardModal
│  └─ 動画選択 ──> アイテム付与 ──> 自動消滅トースト／休憩タイマー再開
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

- `CONFIG.world.initialCameraScale`、`CONFIG.maxRestoredBodies`、`CONFIG.goldenChance` は現在の主要ロジックでは未使用。
- `PhysicsCanvasProps.counts` は渡されるが、Body復元や描画には未使用。
- `UnlockedItems.bird` / `balloon` は保存可能だが、現在のShopに購入UIはなく、通常キャリアの発生条件にも使われない。
- 広告枠はプレースホルダーであり、Google AdSenseスクリプトや広告unit IDはまだ組み込まれていない。

## 4.6 タイマー連続モード・休憩リセット・アイテム獲得通知

- 休憩モード中にリセット、または集中モードへ手動切替を行う場合は、現在の休憩時間とボーナスが失われることを確認するダイアログを表示し、承認後のみ実行する。
- 自動切替は `canUseAutoSwitch` による権限ゲートを必ず通す。現在の既定プレミアム権限は有効だが、将来の課金判定ではこのフラグだけで無効化できる構造を維持する。
- 自動切替が有効な場合、Focus完了時の動画選択モーダルを表示せず、そのままBreakを開始する。Break完了時も停止せず、そのままFocusと供給スケジュールを再開する。
- Focus完了時のランダムアイテム抽選・インベントリへの1回限りの加算は、自動切替の有無にかかわらず維持する。`pendingItemRewardRef` と `itemRewardGrantedRef` による二重付与防止を変更しない。
- アイテム獲得表示は操作を遮るモーダルではなく、自動消滅するトーストである。ズームインと発光を伴って表示し、1.5秒後にフェードを開始、2秒後に自動で閉じる。手動の開封・受取ボタンは表示しない。
- 自動切替が無効な場合は従来どおり動画選択を表示する。動画完了時はBonus Break、スキップ時は通常Breakを開始し、どちらもアイテムトーストを表示する。
- Matter.jsの更新はタイマー・動画・トーストの状態に関係なく継続する。

## 4.7 Firebase Authentication連携

- 認証基盤はFirebase Authenticationへ一本化する。Auth.js、NextAuth Route Handler、Credentials Provider、独自D1 Adapter、独自メール登録APIは使用しない。
- Firebase Web App設定は `NEXT_PUBLIC_FIREBASE_API_KEY`、`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`、`NEXT_PUBLIC_FIREBASE_PROJECT_ID`、`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`、`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`、`NEXT_PUBLIC_FIREBASE_APP_ID` から読み込む。Analyticsを将来有効化する場合だけ `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` を設定する。
- `src/lib/firebase.ts` はFirebase Appを重複初期化せず、既存Appがあれば再利用する。`auth` と選択画面を毎回表示する `googleProvider` を共有exportする。
- Google認証は `signInWithPopup()`、メールログインは `signInWithEmailAndPassword()`、新規登録は `createUserWithEmailAndPassword()` を使用する。新規登録後は `updateProfile()` で表示名を設定する。
- メール新規登録後は `sendEmailVerification()` を実行し、成功・失敗にかかわらず作成直後のセッションを `signOut(auth)` で終了する。メールログイン後は `emailVerified` がtrueの場合だけモーダルを閉じる。
- 未確認ユーザーの再送操作はメール／パスワードで一時再認証し、`sendEmailVerification()` 後に必ずサインアウトする。成功後60秒のcooldown中は再送ボタンを無効化する。
- Settings Modalは `onAuthStateChanged()` のunsubscribe関数をEffect cleanupとして返し、認証状態をFirebase `User` から直接描画する。password providerかつ未確認のUserはログイン済み表示から除外する。ログアウトは `signOut(auth)` を使用する。
- 認証モーダルは設定画面から明示的に開いた場合だけ表示する。未ログイン時に自動表示せず、ゲストはタイマー・物理・ゲーム機能を制限なく利用できる。
- Firebase ConsoleではGoogleとメール／パスワードのSign-in providerを有効化し、ローカルおよび本番のホスト名をAuthorized domainsへ登録する。
- `schema.sql` とD1の既存ユーザー関連テーブルは将来のゲームデータ同期・課金連携用の設計として残るが、ブラウザ認証やパスワード検証には使用しない。

## 5. 変更時チェックリスト

- `npx tsc --noEmit` が成功すること。
- `npm run build` で `/`、`/privacy` が生成されること。
- `npm run build` で `out` が生成され、`out/index.html`、`out/privacy.html`、`out/manifest.webmanifest` が存在すること。
- `npx wrangler deploy --dry-run --config wrangler.json` が `./out` のassetsを読み込み、entry-pointまたはassets directory missingを報告しないこと。
- Focus/Break/Pause/Reset/Spaceキー、Reward分岐、Bonus Break終了リセットを確認すること。
- Matter.jsがタイマー停止中とページ非表示中にも更新されること。
- 320px程度の狭い画面でツールバーが親幅を押し広げず、横スワイプでき、スクロールバーが見えないこと。
- Desktop広告が右側300〜336px、Mobile広告が高さ50pxで、Canvas開始位置が7.75remであること。
- Home画面に旧プライバシーポリシーリンクがなく、法務リンクがSettings最下部だけに表示されること。
- 通常、Bonus、Gold Boostの色・サイズ独立抽選を確認すること。
- 3,000m、5,000m、10,000mのイベント境界と45秒／15秒切替を確認すること。
- デバッグOFFでZap・UFO・10秒・診断ログ／表示が無効、デバッグONで従来機能が有効になること。物理診断の安全処理は常時動作すること。
- Deep Coreの中央限定Static化、側面Dynamic、Terrain吸収の絶対Y基準を確認すること。
- 猫の通常1/1,000・デバッグ1/100抽選、90ms運搬／落下アニメーション、125ms走行アニメーション、テーマ色反転、画面外削除を確認すること。猫の通過でSleeping Bodyが起床しないこと。
- localStorage破損値でクラッシュせず、安全な初期値へ戻ること。
- Settingsから日本語／英語を切り替えるとヘッダー・Shop・設定モーダル・Terms / Privacyリンクと法務本文が即時更新され、再読み込み後も `pomotm_lang` から復元されること。
- Settings最下部のTerms/Privacyリンクが日英で切り替わり、各長文モーダルがスクロールでき、閉じた後もSettingsが表示されていること。
- 未ログインで認証UIが自動表示されず、タイマーとゲームを制限なく利用できること。SettingsからAuth Modalを開閉できること。Firebase Googleログイン後に名前・メール・画像が表示されること。メール登録時に確認メールが届いて即時サインアウトされ、未確認ログインが拒否されること。再送が60秒間連打防止され、確認後のログインだけがSettingsへ反映されること。重複メール・不正入力・誤パスワード・ポップアップキャンセルが安全に処理されること。ログアウト後に `onAuthStateChanged()` 経由でゲスト表示へ戻ること。
- ユーザー操作後の初回接地で通常／GiantのSEが1回だけ鳴り、大量同時接地で連打されないこと。UFO／Space Alien表示中だけループ音が鳴り、退場・タブ非表示・アンマウントで停止すること。
