# AI City 3D Asset Licenses

다운로드/확인일: 2026-08-30

런타임에 포함된 외부 모델은 모두 제작자의 공식 배포본에서 받은 CC0 에셋이다. 원본 `License.txt`는 이 폴더와 `assets-source/licenses/`에 그대로 보존한다. 자동 다운로드 기록은 `assets-source/acquisition.json`, 사용자 제공본은 `assets-source/manual-acquisition.json`, 실제 선별 파일·원본 파일·SHA-256은 `assets-source/selected.json`에 기록한다.

## Kenney — Hexagon Kit

- 공식 URL: https://kenney.nl/assets/hexagon-kit
- 라이선스: CC0-1.0
- 사용 모델: `grass.glb`, `dirt.glb`, `water.glb`, `building-dock.glb`, `grass-hill.glb`, `stone-hill.glb`, `grass-forest.glb`, `water-rocks.glb`, `water-island.glb`, `unit-ship.glb`
- 해안 구성: 육지 외곽의 부두·언덕·숲과 근해의 암초·작은 섬·선박을 정적 인스턴스로 배치
- 원본 라이선스: `kenney-hexagon-License.txt`

## Kenney — City Kit Roads

- 공식 URL: https://kenney.nl/assets/city-kit-roads
- 라이선스: CC0-1.0
- 사용 모델: `road-straight.glb`, `road-curve.glb`, `road-intersection.glb`, `road-crossroad.glb`, `road-side.glb`
- 원본 라이선스: `kenney-roads-License.txt`

## Kenney — City Kit Suburban

- 공식 URL: https://kenney.nl/assets/city-kit-suburban
- 라이선스: CC0-1.0
- 사용 모델: `building-type-a.glb`, `building-type-b.glb`, `building-type-c.glb`, `building-type-t.glb`, `building-type-u.glb`
- 원본 라이선스: `kenney-suburban-License.txt`

## Kenney — City Kit Commercial

- 공식 URL: https://kenney.nl/assets/city-kit-commercial
- 라이선스: CC0-1.0
- 사용 모델: `building-a.glb`, `building-b.glb`, `building-skyscraper-a.glb`, `building-skyscraper-b.glb`
- 원본 라이선스: `kenney-commercial-License.txt`

## Kenney — City Kit Industrial

- 공식 URL: https://kenney.nl/assets/city-kit-industrial
- 라이선스: CC0-1.0
- 사용 모델: `building-a.glb`, `building-m.glb`, `building-l.glb`, `chimney-large.glb`, `detail-tank.glb`
- 원본 라이선스: `kenney-industrial-License.txt`

## Kenney — Nature Kit

- 공식 URL: https://kenney.nl/assets/nature-kit
- 라이선스: CC0-1.0
- 사용 모델: `tree_default.glb`, `tree_cone.glb`, `tree_oak.glb`, `tree_pineTallA.glb`, `plant_bush.glb`, `rock_largeA.glb`, `rock_largeB.glb`, `rock_tallA.glb`
- 원본 라이선스: `kenney-nature-License.txt`

## Kenney — Car Kit

- 공식 URL: https://kenney.nl/assets/car-kit
- 라이선스: CC0-1.0
- 사용 모델: `sedan.glb`, `hatchback-sports.glb`, `truck.glb`
- 원본 라이선스: `kenney-car-License.txt`

## Kenney — Blocky Characters

- 공식 URL: https://kenney.nl/assets/blocky-characters
- 라이선스: CC0-1.0
- 사용 모델: `character-a.glb`, `character-b.glb`
- 웹 최적화: 게임에서 사용하지 않는 원본 애니메이션을 제거하고 정적 GLB로 패키징
- 원본 라이선스: `kenney-people-License.txt`

## Quaternius — Ultimate Space Kit

- 공식 URL: https://quaternius.com/packs/ultimatespacekit.html
- 라이선스: CC0-1.0
- 제공/검증일: 2026-08-30
- 사용 원본: `SolarPanel_Ground.gltf`, `SolarPanel_Structure.gltf`
- 런타임 파일: `solar-small.glb`, `solar-large.glb`
- 처리: 원본의 내장 버퍼·32px atlas를 GLB로 묶고 meshopt로 무손상 중심 최적화
- 원본 라이선스: `quaternius-space-License.txt`
- 참고: 동봉 라이선스 첫 줄은 다른 팩명인 “Ultimate Platformer Pack”으로 표기되어 있으나, 본문은 Quaternius CC0 1.0이고 공식 Ultimate Space Kit 페이지 역시 CC0와 glTF 92종을 명시한다. 원문은 수정하지 않고 보존했다.

## Quaternius — Farm Buildings Pack

- 공식 URL: https://quaternius.com/packs/farmbuildings.html
- 라이선스: CC0-1.0
- 제공/검증일: 2026-08-30
- 사용 원본: `Windmill.obj`, `Windmill.mtl`
- 런타임 파일: `wind-turbine.glb`
- 처리: OBJ/MTL의 선형 diffuse 값을 sRGB로 보정해 GLB로 변환하고 평면 색상 재질을 팔레트 1개로 통합. 작은 타일에서 뭉치는 원본 다엽 바퀴 노드는 제거하고 공용 3엽 로터 InstancedMesh를 사용한 뒤 meshopt로 최적화
- 원본 라이선스: `quaternius-farm-License.txt`

## 새

외부 모델을 사용하지 않는다. Three.js 코드로 만든 단순 V자 실루엣을 풀링하여 사용한다.
