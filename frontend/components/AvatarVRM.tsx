'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  GLTFLoader,
  DRACOLoader,
  KTX2Loader,
} from 'three-stdlib';
import {
  VRM,
  VRMUtils,
  VRMExpressionPresetName,
} from '@pixiv/three-vrm';

// VRMLoaderPlugin はバージョン差があるため any で安全に import（無くても動作）
let VRMLoaderPluginCtor: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const mod =
    // v2 で多い
    (require('@pixiv/three-vrm').VRMLoaderPlugin) ??
    // 環境によってはこちら
    (require('@pixiv/three-vrm/plugins/VRMLoaderPlugin').VRMLoaderPlugin);
  VRMLoaderPluginCtor = mod;
} catch {
  VRMLoaderPluginCtor = null;
}

type Props = {
  /** /turn のレスポンス audio_url をフルURLにしたもの */
  audioUrl?: string | null;
};

export default function AvatarVRM({ audioUrl }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const vrmRef = useRef<VRM | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const roRef = useRef<ResizeObserver | null>(null);

  // WebAudio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaElRef = useRef<HTMLAudioElement | null>(null);
  const levelSmoothedRef = useRef(0);

  // 瞬き制御
  const blinkRef = useRef({
    tNext: 0,
    tEnd: 0,
  });

  const setStatus = (msg: string) => {
    const el = containerRef.current?.querySelector<HTMLDivElement>('.vrm-status');
    if (el) el.textContent = msg;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // ===== Three 初期化 =====
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7fb);

    // ★ より寄りの“対面”カメラ
    const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 100);
    camera.position.set(0, 1.42, 0.62);
    camera.lookAt(new THREE.Vector3(0, 1.40, 0));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // @ts-ignore three r164+
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const mount = containerRef.current;
    const w = Math.max(1, mount.clientWidth);
    const h = Math.max(1, mount.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    // ライト
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(0.5, 1.2, 0.8);
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // デバッグ原点
    const originDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.01),
      new THREE.MeshBasicMaterial({ color: 0x0099ff })
    );
    originDot.position.set(0, 1.3, 0);
    scene.add(originDot);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    roRef.current = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cw = Math.max(1, e.contentRect.width);
        const ch = Math.max(1, e.contentRect.height);
        if (cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = cw / ch;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(cw, ch);
        }
      }
    });
    roRef.current.observe(mount);

    // ===== ヘルパ：顔に合わせてカメラを“対面”配置 =====
    function placeCameraToFace(vrm: VRM, cam: THREE.PerspectiveCamera) {
      const head = vrm.humanoid?.getNormalizedBoneNode('head');
      if (!head) return;
      const headWorld = new THREE.Vector3();
      head.getWorldPosition(headWorld);

      // 顔の少し上・前
      const offset = new THREE.Vector3(0, 0.06, 1.20); // 近づけるなら 0.50〜0.58
      const camPos = headWorld.clone().add(offset);
      cam.position.copy(camPos);

      // 顔の少し下を向く＝対面感
      const lookAt = headWorld.clone().add(new THREE.Vector3(0, -0.03, 0));
      cam.lookAt(lookAt);
      cam.updateProjectionMatrix();
    }

    // ===== ヘルパ：腕を基本おろす（A/Tポーズ対策） =====
    function relaxArms(vrm: VRM) {
      const L = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
      const R = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
      if (!L || !R) return;

      L.rotation.set(0, 0, 0);
      R.rotation.set(0, 0, 0);

      // 体の脇に沿うように回す（左右反対）
      const z = 1.28; // 強すぎるなら 1.10〜1.25
      L.rotation.z = +z;
      R.rotation.z = -z;

      // 肩を少しだけ内向きへ
      const Ls = vrm.humanoid?.getNormalizedBoneNode('leftShoulder');
      const Rs = vrm.humanoid?.getNormalizedBoneNode('rightShoulder');
      if (Ls) Ls.rotation.y = THREE.MathUtils.degToRad(-5);
      if (Rs) Rs.rotation.y = THREE.MathUtils.degToRad(+5);
    }

    // ===== VRM 読み込み =====
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
    const vrmUrl = `${basePath}/avatar.vrm`; // /public/avatar.vrm

    (async () => {
      try {
        setStatus('VRM: ネットワーク確認中...');
        const test = await fetch(vrmUrl, { method: 'GET' });
        if (!test.ok) throw new Error(`VRM not reachable (${test.status}) at ${vrmUrl}`);

        setStatus('VRM: ローダ準備中...');
        const loader = new GLTFLoader();

        // Draco/KTX2 はローカル（/public 配下）を優先
        const draco = new DRACOLoader();
        draco.setDecoderPath('/draco/');
        loader.setDRACOLoader(draco);

        const ktx2 = new KTX2Loader()
          .setTranscoderPath('/basis/')
          .detectSupport(renderer);
        loader.setKTX2Loader(ktx2);

        // VRM プラグインがあれば登録（無くてもフォールバックで表示）
        if (VRMLoaderPluginCtor) {
          loader.register((parser: any) => new VRMLoaderPluginCtor(parser));
        }

        setStatus('VRM: 読み込み中...');
        loader.load(
          vrmUrl,
          (gltf) => {
            try {
              VRMUtils.removeUnnecessaryJoints(gltf.scene);
              VRMUtils.removeUnnecessaryVertices(gltf.scene);
            } catch {}

            // plugin が機能していれば userData.vrm に VRM 本体が入る
            const vrm: VRM | undefined = (gltf as any).userData?.vrm as VRM | undefined;

            if (vrm) {
              vrmRef.current = vrm;
              vrm.scene.rotation.y = Math.PI; // 正面
              vrm.scene.position.set(0, 0, 0);
              vrm.scene.scale.set(1, 1, 1);

              scene.add(vrm.scene);

              // ★ 腕をおろす → 対面に寄せる
              relaxArms(vrm);
              placeCameraToFace(vrm, camera);

              // 可能なら視線をカメラへ
              try { (vrm as any).lookAt && ((vrm as any).lookAt.target = camera); } catch {}

              setStatus('VRM: 読み込み完了');
            } else {
              // VRM メタ無しでも見た目は出す
              scene.add(gltf.scene);
              setStatus('VRM: VRMメタ無し（フォールバック表示）');
            }
          },
          undefined,
          (e) => {
            console.error('GLTFLoader load error:', e);
            setStatus('VRM: 読み込みエラー（コンソール参照）');
          }
        );
      } catch (e) {
        console.error(e);
        setStatus('VRM: ファイル取得に失敗（/public/avatar.vrm を確認）');
      }
    })();

    // ===== アニメーションループ =====
    let raf = 0;
    const tick = () => {
      const dt = clockRef.current.getDelta();
      const vrm = vrmRef.current;

      // しゃべりレベル
      const level = levelSmoothedRef.current; // 0~1
      const speaking = level > 0.02;

      // 口パク（音声が無い時もわずかに動かす）
      if (vrm?.expressionManager) {
        const mouthTarget = speaking
          ? Math.min(1, level * 1.8)
          : 0.03 + Math.sin(performance.now() * 0.002) * 0.01;
        vrm.expressionManager.setValue(VRMExpressionPresetName.Aa, mouthTarget);
      }

      // 瞬き（2.5〜5.5秒間隔／200ms）
      const now = performance.now();
      const blink = blinkRef.current;
      if (now > blink.tNext && vrm?.expressionManager) {
        blink.tEnd = now + 200;
        blink.tNext = now + 2500 + Math.random() * 3000;
      }
      if (vrm?.expressionManager) {
        let blinkVal = 0;
        if (now < blink.tEnd) {
          const p = (blink.tEnd - now) / 200; // 1→0
          blinkVal = Math.sin(p * Math.PI);   // 0→1→0
        }
        vrm.expressionManager.setValue(VRMExpressionPresetName.Blink, Math.min(1, blinkVal));
      }

      // 上半身の控えめな揺れ（常時 + 声で少し増える）
      const base = 0.4;
      const extra = speaking ? Math.min(0.8, level * 1.2) : 0;
      const amp = base + extra;

      const t = performance.now() * 0.001;
      if (vrm?.humanoid) {
        const head = vrm.humanoid.getNormalizedBoneNode('head');
        const chest =
          vrm.humanoid.getNormalizedBoneNode('chest') ||
          vrm.humanoid.getNormalizedBoneNode('upperChest');

        if (head) {
          head.rotation.y = THREE.MathUtils.degToRad(Math.sin(t * 2.0) * 1.6 * amp); // 左右
          head.rotation.x = THREE.MathUtils.degToRad(Math.sin(t * 3.0) * 0.9 * amp); // うなずき
        }
        if (chest) {
          // 腕が暴れないよう控えめ
          chest.rotation.y = THREE.MathUtils.degToRad(Math.sin(t * 1.3) * 0.5 * amp);
          chest.rotation.x = THREE.MathUtils.degToRad(Math.sin(t * 1.7) * 0.4 * amp);
        }
      } else if (sceneRef.current) {
        // フォールバック：モデル全体を微スウェイ
        const root =
          vrm?.scene ??
          sceneRef.current.children.find(
            (o) => o.type !== 'AmbientLight' && o.type !== 'DirectionalLight'
          );
        if (root) {
          root.rotation.y = Math.sin(t * 0.6) * 0.02 * amp;
          root.rotation.x = Math.sin(t * 0.9) * 0.015 * amp;
        }
      }

      vrm?.update(dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      roRef.current?.disconnect();
      if (vrmRef.current) {
        vrmRef.current.scene.parent?.remove(vrmRef.current.scene);
        vrmRef.current = null;
      }
      renderer.dispose();
      if (containerRef.current?.firstChild) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ===== 音声URL → WebAudio レベル検出 =====
  useEffect(() => {
    if (!audioUrl) return;

    try {
      mediaElRef.current?.pause();
      mediaElRef.current?.remove();
    } catch {}
    try {
      analyserRef.current?.disconnect();
      audioCtxRef.current?.close();
    } catch {}

    const audio = new Audio(audioUrl);
    audio.crossOrigin = 'anonymous';
    mediaElRef.current = audio;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyserRef.current = analyser;

    // 軽いローパスで母音寄りに
    const biquad = ctx.createBiquadFilter();
    biquad.type = 'lowpass';
    biquad.frequency.value = 1400;

    src.connect(biquad);
    biquad.connect(analyser);
    analyser.connect(ctx.destination);

    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);

      const prev = levelSmoothedRef.current;
      const attack = 0.6,
        release = 0.15;
      levelSmoothedRef.current =
        rms > prev ? prev * (1 - attack) + rms * attack : prev * (1 - release) + rms * release;

      raf = requestAnimationFrame(loop);
    };
    loop();

    audio.play().catch((e) => console.warn('audio play error', e));

    return () => {
      cancelAnimationFrame(raf);
      try {
        audio.pause();
      } catch {}
      try {
        analyser.disconnect();
      } catch {}
      try {
        ctx.close();
      } catch {}
    };
  }, [audioUrl]);

  return (
    <div
      ref={containerRef}
      className="card"
      style={{ height: 520, width: '100%', position: 'relative', overflow: 'hidden' }}
    >
      <div
        className="vrm-status"
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          background: 'rgba(0,0,0,0.45)',
          color: '#fff',
          padding: '4px 8px',
          borderRadius: 6,
          fontSize: 12,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        VRM: 準備中…
      </div>
    </div>
  );
}
