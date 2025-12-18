import { useState, useRef, useEffect, useCallback } from 'react'
import Matter from 'matter-js'
import './App.css'

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8B500', '#FF6F61', '#6B5B95', '#88B04B', '#F7CAC9',
  '#92A8D1', '#955251', '#B565A7', '#009B77', '#DD4124'
]

function App() {
  const [names, setNames] = useState('토끼*2, 햄스터*2, 호랑이*2')
  const [gameState, setGameState] = useState('idle') // idle, playing, finished
  const [winner, setWinner] = useState(null)
  const [lastSurvivor, setLastSurvivor] = useState(true)
  const [selectedMap, setSelectedMap] = useState('cat') // cat, octopus, star
  const [bricks, setBricks] = useState([])
  const [particles, setParticles] = useState([])

  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const renderRef = useRef(null)
  const runnerRef = useRef(null)
  const ballsRef = useRef([])
  const bricksRef = useRef([])
  const gameDataRef = useRef(null)
  const ballIntervalRef = useRef(null)
  const ballTrailsRef = useRef({}) // 공 트레일 저장

  // 이름 파싱: "토끼*3, 햄스터" -> ["토끼", "토끼", "토끼", "햄스터"]
  const getNameList = useCallback(() => {
    const items = names.split(/[,\n]/).map(n => n.trim()).filter(n => n.length > 0)
    const result = []

    items.forEach(item => {
      const match = item.match(/^(.+)\*(\d+)$/)
      if (match) {
        const name = match[1].trim()
        const count = parseInt(match[2], 10)
        for (let i = 0; i < count; i++) {
          result.push(name)
        }
      } else {
        result.push(item)
      }
    })

    return result
  }, [names])

  // 배열 셔플
  const shuffleArray = (array) => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // 파티클 효과
  const addParticles = useCallback((x, y, color) => {
    const newParticles = []
    for (let i = 0; i < 20; i++) {
      newParticles.push({
        id: Date.now() + i + Math.random(),
        x,
        y,
        vx: (Math.random() - 0.5) * 25,
        vy: (Math.random() - 0.5) * 25,
        color,
        life: 1,
        size: Math.random() * 12 + 6
      })
    }
    setParticles(prev => [...prev, ...newParticles])
  }, [])

  // 파티클 업데이트
  useEffect(() => {
    if (particles.length === 0) return

    const interval = setInterval(() => {
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.4,
            life: p.life - 0.02,
            size: p.size * 0.97
          }))
          .filter(p => p.life > 0)
      )
    }, 16)

    return () => clearInterval(interval)
  }, [particles.length])

  // 게임 초기화
  useEffect(() => {
    if (gameState !== 'playing' || !canvasRef.current || !gameDataRef.current) return

    const { nameList, isLastSurvivor, mapType } = gameDataRef.current
    const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter

    // 기존 엔진 정리
    if (engineRef.current) {
      Composite.clear(engineRef.current.world)
      Engine.clear(engineRef.current)
    }
    if (renderRef.current) {
      Render.stop(renderRef.current)
      if (renderRef.current.canvas) {
        renderRef.current.canvas.remove()
      }
    }
    if (runnerRef.current) {
      Runner.stop(runnerRef.current)
    }

    const engine = Engine.create({
      gravity: { x: 0, y: 0.6 }
    })
    engineRef.current = engine

    const container = canvasRef.current
    const viewWidth = container.clientWidth || 700
    const viewHeight = container.clientHeight || 600

    // 경기장 크기 (세로로 길게)
    const worldWidth = viewWidth
    const worldHeight = 1500

    const render = Render.create({
      element: container,
      engine: engine,
      options: {
        width: viewWidth,
        height: viewHeight,
        wireframes: false,
        background: '#1a1a2e',
        hasBounds: true
      }
    })
    renderRef.current = render

    // 벽 생성
    const wallOptions = { isStatic: true, restitution: 0.8, friction: 0, render: { fillStyle: '#16213e' } }
    const walls = [
      Bodies.rectangle(worldWidth / 2, -25, worldWidth, 50, wallOptions),
      Bodies.rectangle(worldWidth / 2, worldHeight + 25, worldWidth, 50, wallOptions),
      Bodies.rectangle(-25, worldHeight / 2, 50, worldHeight, wallOptions),
      Bodies.rectangle(worldWidth + 25, worldHeight / 2, 50, worldHeight, wallOptions),
    ]

    // 원형 블록 생성 (벌집 배열 + 랜덤 셔플)
    const shuffledNames = shuffleArray(nameList)

    // 참가자 수에 따라 블록 크기 동적 조절 (50명까지 대응)
    let brickRadius = 30
    if (shuffledNames.length > 30) brickRadius = 22
    else if (shuffledNames.length > 20) brickRadius = 25
    else if (shuffledNames.length > 12) brickRadius = 28

    const spacing = brickRadius * 2.4  // 블록 간 간격

    // 벌집 배열 계산
    const cols = Math.floor((worldWidth - 50) / spacing)
    const rows = Math.ceil(shuffledNames.length / cols) + 2

    // 모든 가능한 위치 생성 후 셔플 (완전 랜덤 배치)
    const positions = []
    for (let row = 0; row < rows + 2; row++) {
      const isOffsetRow = row % 2 === 1
      const colCount = isOffsetRow ? cols - 1 : cols
      for (let col = 0; col < colCount; col++) {
        const x = 50 + col * spacing + (isOffsetRow ? spacing / 2 : 0)
        const y = 60 + row * (spacing * 0.866)  // 벌집 높이 비율
        if (x > 30 && x < worldWidth - 30) {
          positions.push({ x, y })
        }
      }
    }

    // 위치도 랜덤 셔플
    const shuffledPositions = shuffleArray(positions).slice(0, shuffledNames.length)

    const brickBodies = shuffledNames.map((name, i) => {
      const pos = shuffledPositions[i]
      // 약간의 랜덤 오프셋 추가 (더 자연스럽게)
      const x = pos.x + (Math.random() - 0.5) * 10
      const y = pos.y + (Math.random() - 0.5) * 10

      const colorIndex = nameList.indexOf(name) % COLORS.length
      const brick = Bodies.circle(x, y, brickRadius, {
        isStatic: true,
        restitution: 1,
        friction: 0,
        label: name,
        render: {
          fillStyle: COLORS[colorIndex],
          strokeStyle: '#ffffff',
          lineWidth: 2
        }
      })
      brick.name = name
      brick.color = COLORS[colorIndex]
      brick.radius = brickRadius
      return brick
    })
    bricksRef.current = brickBodies

    // 블록 영역 계산
    const maxBlockY = Math.max(...brickBodies.map(b => b.position.y)) + brickRadius

    // 장애물 배치 (맵 타입에 따라 다르게)
    const obstacles = []
    const breakableBlocks = []
    const obstacleStartY = maxBlockY + 80

    // 맵별 장애물 생성
    const centerX = worldWidth / 2
    const catY = obstacleStartY + 150  // 고양이 얼굴 중심

    if (mapType === 'cat') {
      // 😺 고양이 - 모노톤 핑크/코랄
      const mainColor = '#f472b6'
      const lightColor = '#f9a8d4'
      const darkColor = '#db2777'
      const accentColor = '#fbbf24'

      // 귀 (삼각형) - 살랑살랑 움직임
      const leftEar = Bodies.polygon(centerX - 90, catY - 50, 3, 42, {
        isStatic: true, restitution: 1.8, friction: 0, angle: -Math.PI / 10,
        render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 3 }
      })
      leftEar.isBumper = true
      leftEar.isRotating = true
      leftEar.rotateSpeed = 0.008
      const rightEar = Bodies.polygon(centerX + 90, catY - 50, 3, 42, {
        isStatic: true, restitution: 1.8, friction: 0, angle: Math.PI / 10,
        render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 3 }
      })
      rightEar.isBumper = true
      rightEar.isRotating = true
      rightEar.rotateSpeed = -0.008
      obstacles.push(leftEar, rightEar)

      // 눈 (큰 범퍼) - 좌우로 움직임
      const leftEye = Bodies.circle(centerX - 55, catY + 20, 32, {
        isStatic: true, restitution: 2.0, friction: 0,
        render: { fillStyle: '#1a1a2e', strokeStyle: accentColor, lineWidth: 4 }
      })
      leftEye.isBumper = true
      leftEye.isMoving = true
      leftEye.moveSpeed = 1.5
      leftEye.moveRange = 15
      leftEye.startX = centerX - 55
      leftEye.moveOffset = 0
      const rightEye = Bodies.circle(centerX + 55, catY + 20, 32, {
        isStatic: true, restitution: 2.0, friction: 0,
        render: { fillStyle: '#1a1a2e', strokeStyle: accentColor, lineWidth: 4 }
      })
      rightEye.isBumper = true
      rightEye.isMoving = true
      rightEye.moveSpeed = 1.5
      rightEye.moveRange = 15
      rightEye.startX = centerX + 55
      rightEye.moveOffset = 0
      obstacles.push(leftEye, rightEye)

      // 눈 하이라이트 - 깜빡임
      const leftHighlight = Bodies.circle(centerX - 62, catY + 12, 10, {
        isStatic: true, restitution: 1.5, friction: 0,
        render: { fillStyle: '#fff', strokeStyle: '#fff', lineWidth: 1 }
      })
      leftHighlight.isBlinking = true
      leftHighlight.blinkPhase = 0
      leftHighlight.originalColor = '#fff'
      const rightHighlight = Bodies.circle(centerX + 48, catY + 12, 10, {
        isStatic: true, restitution: 1.5, friction: 0,
        render: { fillStyle: '#fff', strokeStyle: '#fff', lineWidth: 1 }
      })
      rightHighlight.isBlinking = true
      rightHighlight.blinkPhase = 0
      rightHighlight.originalColor = '#fff'
      obstacles.push(leftHighlight, rightHighlight)

      // 코 - 위아래로 움직임
      const nose = Bodies.circle(centerX, catY + 70, 16, {
        isStatic: true, restitution: 1.5, friction: 0,
        render: { fillStyle: darkColor, strokeStyle: mainColor, lineWidth: 3 }
      })
      nose.isBumper = true
      nose.isMovingY = true
      nose.moveSpeedY = 2
      nose.moveRangeY = 8
      nose.startY = catY + 70
      nose.moveOffsetY = 0
      obstacles.push(nose)

      // 수염 - 회전 (고양이답게 휘적휘적)
      const whiskers = [
        { x: centerX - 120, y: catY + 55, angle: Math.PI / 15, speed: 0.01 },
        { x: centerX - 115, y: catY + 80, angle: 0, speed: -0.012 },
        { x: centerX + 120, y: catY + 55, angle: -Math.PI / 15, speed: -0.01 },
        { x: centerX + 115, y: catY + 80, angle: 0, speed: 0.012 },
      ]
      whiskers.forEach(w => {
        const whisker = Bodies.rectangle(w.x, w.y, 55, 4, {
          isStatic: true, restitution: 1.3, friction: 0, angle: w.angle,
          render: { fillStyle: lightColor, strokeStyle: lightColor, lineWidth: 1 }
        })
        whisker.isRotating = true
        whisker.rotateSpeed = w.speed
        obstacles.push(whisker)
      })

      // 회전하는 바
      for (let i = 0; i < 3; i++) {
        const y = catY + 200 + i * 200
        if (y > worldHeight - 200) break
        const bar = Bodies.rectangle(centerX, y, 120, 10, {
          isStatic: true, restitution: 1.5, friction: 0,
          render: { fillStyle: darkColor, strokeStyle: mainColor, lineWidth: 2 }
        })
        bar.isRotating = true
        bar.rotateSpeed = (i % 2 === 0 ? 1 : -1) * 0.025
        obstacles.push(bar)
      }

      // 좌우로 움직이는 범퍼
      for (let i = 0; i < 4; i++) {
        const y = catY + 300 + i * 180
        if (y > worldHeight - 150) break
        const bumper = Bodies.circle(centerX, y, 22, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 3 }
        })
        bumper.isBumper = true
        bumper.isMoving = true
        bumper.moveSpeed = 2.5 + i * 0.5
        bumper.moveRange = 130
        bumper.startX = centerX
        bumper.moveOffset = i * Math.PI / 2
        obstacles.push(bumper)
      }

      // 사이드 범퍼 - 깜빡임 + 움직임
      const tones = [mainColor, lightColor, darkColor]
      for (let row = 0; row < 4; row++) {
        const y = catY + 250 + row * 150
        if (y > worldHeight - 150) break
        const positions = [worldWidth * 0.2, worldWidth * 0.8]
        positions.forEach((x, i) => {
          const bumper = Bodies.circle(x, y + (i * 50), 16, {
            isStatic: true, restitution: 1.9, friction: 0,
            render: { fillStyle: tones[(row + i) % 3], strokeStyle: lightColor, lineWidth: 2 }
          })
          bumper.isBumper = true
          // 번갈아 깜빡임 또는 움직임
          if ((row + i) % 2 === 0) {
            bumper.isBlinking = true
            bumper.blinkPhase = row * Math.PI / 3
            bumper.originalColor = tones[(row + i) % 3]
          } else {
            bumper.isMoving = true
            bumper.moveSpeed = 1.8
            bumper.moveRange = 40
            bumper.startX = x
            bumper.moveOffset = row * Math.PI / 4
          }
          obstacles.push(bumper)
        })
      }

      // 벽면 범퍼 - 위아래로 움직임
      for (let i = 0; i < 5; i++) {
        const y = catY + 150 + i * 150
        if (y > worldHeight - 100) break
        const leftB = Bodies.circle(40, y, 14, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 2 }
        })
        leftB.isBumper = true
        leftB.isMovingY = true
        leftB.moveSpeedY = 1.5 + i * 0.2
        leftB.moveRangeY = 30
        leftB.startY = y
        leftB.moveOffsetY = i * Math.PI / 3
        const rightB = Bodies.circle(worldWidth - 40, y, 14, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 2 }
        })
        rightB.isBumper = true
        rightB.isMovingY = true
        rightB.moveSpeedY = 1.5 + i * 0.2
        rightB.moveRangeY = 30
        rightB.startY = y
        rightB.moveOffsetY = i * Math.PI / 3 + Math.PI
        obstacles.push(leftB, rightB)
      }

      // 스피너
      for (let i = 0; i < 3; i++) {
        const y = catY + 400 + i * 200
        if (y > worldHeight - 200) break
        const spinner = Bodies.rectangle(centerX + (i % 2 === 0 ? -60 : 60), y, 90, 8, {
          isStatic: true, restitution: 1.2, friction: 0,
          render: { fillStyle: '#fff', strokeStyle: mainColor, lineWidth: 2 }
        })
        spinner.isSpinner = true
        spinner.spinSpeed = 0.01
        spinner.maxSpinSpeed = 0.18
        obstacles.push(spinner)
      }

      // 속도 부스터
      const boosterY = catY + 550
      if (boosterY < worldHeight - 150) {
        const leftBooster = Bodies.rectangle(worldWidth * 0.15, boosterY, 50, 80, {
          isStatic: true, isSensor: true,
          render: { fillStyle: 'rgba(0, 255, 136, 0.4)', strokeStyle: '#00ff88', lineWidth: 3 }
        })
        leftBooster.isBooster = true
        leftBooster.boostPower = 1.6
        const rightBooster = Bodies.rectangle(worldWidth * 0.85, boosterY, 50, 80, {
          isStatic: true, isSensor: true,
          render: { fillStyle: 'rgba(0, 255, 136, 0.4)', strokeStyle: '#00ff88', lineWidth: 3 }
        })
        rightBooster.isBooster = true
        rightBooster.boostPower = 1.6
        obstacles.push(leftBooster, rightBooster)
      }

    } else if (mapType === 'octopus') {
      // 🐙 문어 - 모노톤 퍼플/인디고
      const mainColor = '#8b5cf6'
      const lightColor = '#a78bfa'
      const darkColor = '#6d28d9'
      const accentColor = '#c4b5fd'
      const tones = [mainColor, lightColor, darkColor, accentColor]

      // 머리 - 위아래로 둥실둥실
      const head = Bodies.circle(centerX, catY, 55, {
        isStatic: true, restitution: 2.0, friction: 0,
        render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 4 }
      })
      head.isBumper = true
      head.isMovingY = true
      head.moveSpeedY = 1.2
      head.moveRangeY = 20
      head.startY = catY
      head.moveOffsetY = 0
      obstacles.push(head)

      // 눈 - 좌우로 움직임 (눈동자 굴리기)
      const leftEye = Bodies.circle(centerX - 18, catY - 8, 14, {
        isStatic: true, restitution: 1.5, friction: 0,
        render: { fillStyle: '#fff', strokeStyle: darkColor, lineWidth: 2 }
      })
      leftEye.isMoving = true
      leftEye.moveSpeed = 2
      leftEye.moveRange = 8
      leftEye.startX = centerX - 18
      leftEye.moveOffset = 0
      const rightEye = Bodies.circle(centerX + 18, catY - 8, 14, {
        isStatic: true, restitution: 1.5, friction: 0,
        render: { fillStyle: '#fff', strokeStyle: darkColor, lineWidth: 2 }
      })
      rightEye.isMoving = true
      rightEye.moveSpeed = 2
      rightEye.moveRange = 8
      rightEye.startX = centerX + 18
      rightEye.moveOffset = 0
      obstacles.push(leftEye, rightEye)

      // 눈동자 - 깜빡임
      const leftPupil = Bodies.circle(centerX - 18, catY - 5, 6, {
        isStatic: true, restitution: 1.2, friction: 0,
        render: { fillStyle: '#1a1a2e', strokeStyle: '#1a1a2e', lineWidth: 1 }
      })
      leftPupil.isBlinking = true
      leftPupil.blinkPhase = 0
      leftPupil.originalColor = '#1a1a2e'
      const rightPupil = Bodies.circle(centerX + 18, catY - 5, 6, {
        isStatic: true, restitution: 1.2, friction: 0,
        render: { fillStyle: '#1a1a2e', strokeStyle: '#1a1a2e', lineWidth: 1 }
      })
      rightPupil.isBlinking = true
      rightPupil.blinkPhase = 0
      rightPupil.originalColor = '#1a1a2e'
      obstacles.push(leftPupil, rightPupil)

      // 회전하는 촉수 바 + 좌우 움직임
      for (let i = 0; i < 4; i++) {
        const y = catY + 180 + i * 180
        if (y > worldHeight - 200) break
        const bar = Bodies.rectangle(centerX, y, 140, 12, {
          isStatic: true, restitution: 1.6, friction: 0,
          render: { fillStyle: tones[i % 4], strokeStyle: lightColor, lineWidth: 2 }
        })
        bar.isRotating = true
        bar.rotateSpeed = (i % 2 === 0 ? 1 : -1) * 0.03
        bar.isMoving = true
        bar.moveSpeed = 1.2
        bar.moveRange = 50
        bar.startX = centerX
        bar.moveOffset = i * Math.PI / 2
        obstacles.push(bar)
      }

      // 좌우로 움직이는 촉수 범퍼 + 위아래도
      for (let i = 0; i < 3; i++) {
        const y = catY + 280 + i * 200
        if (y > worldHeight - 150) break
        const leftBumper = Bodies.circle(worldWidth * 0.25, y, 20, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: accentColor, lineWidth: 3 }
        })
        leftBumper.isBumper = true
        leftBumper.isMoving = true
        leftBumper.moveSpeed = 2 + i * 0.4
        leftBumper.moveRange = 100
        leftBumper.startX = worldWidth * 0.25
        leftBumper.moveOffset = 0
        obstacles.push(leftBumper)
        const rightBumper = Bodies.circle(worldWidth * 0.75, y, 20, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: accentColor, lineWidth: 3 }
        })
        rightBumper.isBumper = true
        rightBumper.isMoving = true
        rightBumper.moveSpeed = 2 + i * 0.4
        rightBumper.moveRange = 100
        rightBumper.startX = worldWidth * 0.75
        rightBumper.moveOffset = Math.PI
        obstacles.push(rightBumper)
      }

      // 중앙 범퍼 - 회전 + 깜빡임
      for (let row = 0; row < 3; row++) {
        const y = catY + 380 + row * 150
        if (y > worldHeight - 150) break
        const cols = 3
        for (let col = 0; col < cols; col++) {
          const x = worldWidth / 4 * (col + 1)
          const bumper = Bodies.circle(x, y, 16, {
            isStatic: true, restitution: 1.9, friction: 0,
            render: { fillStyle: tones[(row + col) % 4], strokeStyle: lightColor, lineWidth: 2 }
          })
          bumper.isBumper = true
          // 모두 효과 부여
          if ((row + col) % 3 === 0) {
            bumper.isBlinking = true
            bumper.blinkPhase = (row + col) * Math.PI / 4
            bumper.originalColor = tones[(row + col) % 4]
          } else if ((row + col) % 3 === 1) {
            bumper.isMovingY = true
            bumper.moveSpeedY = 1.5
            bumper.moveRangeY = 25
            bumper.startY = y
            bumper.moveOffsetY = col * Math.PI / 3
          } else {
            bumper.isMoving = true
            bumper.moveSpeed = 1.5
            bumper.moveRange = 30
            bumper.startX = x
            bumper.moveOffset = row * Math.PI / 3
          }
          obstacles.push(bumper)
        }
      }

      // 벽면 범퍼 - 위아래 움직임
      for (let i = 0; i < 5; i++) {
        const y = catY + 120 + i * 150
        if (y > worldHeight - 100) break
        const leftB = Bodies.circle(40, y, 13, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 2 }
        })
        leftB.isBumper = true
        leftB.isMovingY = true
        leftB.moveSpeedY = 1.8
        leftB.moveRangeY = 35
        leftB.startY = y
        leftB.moveOffsetY = i * Math.PI / 4
        const rightB = Bodies.circle(worldWidth - 40, y, 13, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 2 }
        })
        rightB.isBumper = true
        rightB.isMovingY = true
        rightB.moveSpeedY = 1.8
        rightB.moveRangeY = 35
        rightB.startY = y
        rightB.moveOffsetY = i * Math.PI / 4 + Math.PI
        obstacles.push(leftB, rightB)
      }

      // 스피너 (더 많이)
      for (let i = 0; i < 3; i++) {
        const y = catY + 450 + i * 180
        if (y > worldHeight - 200) break
        const spinner = Bodies.rectangle(centerX + (i % 2 === 0 ? -70 : 70), y, 100, 10, {
          isStatic: true, restitution: 1.3, friction: 0,
          render: { fillStyle: lightColor, strokeStyle: darkColor, lineWidth: 2 }
        })
        spinner.isSpinner = true
        spinner.spinSpeed = 0.01
        spinner.maxSpinSpeed = 0.15
        obstacles.push(spinner)
      }

      // 속도 부스터
      const boosterY = catY + 600
      if (boosterY < worldHeight - 150) {
        const centerBooster = Bodies.rectangle(centerX, boosterY, 60, 90, {
          isStatic: true, isSensor: true,
          render: { fillStyle: 'rgba(0, 255, 136, 0.4)', strokeStyle: '#00ff88', lineWidth: 3 }
        })
        centerBooster.isBooster = true
        centerBooster.boostPower = 1.6
        obstacles.push(centerBooster)
      }

    } else if (mapType === 'star') {
      // ⭐ 별 - 모노톤 골드/앰버
      const mainColor = '#fbbf24'
      const lightColor = '#fcd34d'
      const darkColor = '#f59e0b'
      const accentColor = '#fef3c7'
      const tones = [mainColor, lightColor, darkColor]

      const starPoints = 5
      const outerRadius = 140
      const innerRadius = 60

      // 바깥쪽 꼭짓점 - 깜빡임 + 약간씩 움직임
      for (let i = 0; i < starPoints; i++) {
        const angle = (i / starPoints) * Math.PI * 2 - Math.PI / 2
        const x = centerX + Math.cos(angle) * outerRadius
        const y = catY + Math.sin(angle) * outerRadius
        const bumper = Bodies.circle(x, y, 28, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 4 }
        })
        bumper.isBumper = true
        // 번갈아 깜빡임 또는 움직임
        if (i % 2 === 0) {
          bumper.isBlinking = true
          bumper.blinkPhase = i * Math.PI / 3
          bumper.originalColor = mainColor
        } else {
          bumper.isMovingY = true
          bumper.moveSpeedY = 1.5
          bumper.moveRangeY = 20
          bumper.startY = y
          bumper.moveOffsetY = i * Math.PI / 4
        }
        obstacles.push(bumper)
      }

      // 안쪽 꼭짓점 - 회전하면서 전체가 돌아감
      for (let i = 0; i < starPoints; i++) {
        const angle = (i / starPoints) * Math.PI * 2 - Math.PI / 2 + Math.PI / starPoints
        const x = centerX + Math.cos(angle) * innerRadius
        const y = catY + Math.sin(angle) * innerRadius
        const bumper = Bodies.circle(x, y, 18, {
          isStatic: true, restitution: 1.8, friction: 0,
          render: { fillStyle: darkColor, strokeStyle: mainColor, lineWidth: 3 }
        })
        bumper.isBumper = true
        bumper.isMoving = true
        bumper.moveSpeed = 1.2
        bumper.moveRange = 15
        bumper.startX = x
        bumper.moveOffset = i * Math.PI / 2.5
        obstacles.push(bumper)
      }

      // 중앙 - 깜빡임
      const center = Bodies.circle(centerX, catY, 38, {
        isStatic: true, restitution: 2.2, friction: 0,
        render: { fillStyle: darkColor, strokeStyle: lightColor, lineWidth: 4 }
      })
      center.isBumper = true
      center.isBlinking = true
      center.blinkPhase = 0
      center.originalColor = darkColor
      obstacles.push(center)

      const centerCore = Bodies.circle(centerX, catY, 15, {
        isStatic: true, restitution: 1.5, friction: 0,
        render: { fillStyle: accentColor, strokeStyle: mainColor, lineWidth: 2 }
      })
      centerCore.isMovingY = true
      centerCore.moveSpeedY = 2.5
      centerCore.moveRangeY = 10
      centerCore.startY = catY
      centerCore.moveOffsetY = Math.PI / 2
      obstacles.push(centerCore)

      // 회전 + 좌우로 움직이는 별 막대
      for (let i = 0; i < 3; i++) {
        const y = catY + 250 + i * 200
        if (y > worldHeight - 200) break
        const bar = Bodies.rectangle(centerX, y, 150, 10, {
          isStatic: true, restitution: 1.5, friction: 0,
          render: { fillStyle: tones[i % 3], strokeStyle: lightColor, lineWidth: 2 }
        })
        bar.isRotating = true
        bar.rotateSpeed = (i % 2 === 0 ? 1 : -1) * 0.025
        bar.isMoving = true
        bar.moveSpeed = 1.3
        bar.moveRange = 60
        bar.startX = centerX
        bar.moveOffset = i * Math.PI / 2
        obstacles.push(bar)
      }

      // 좌우 + 회전하는 별 범퍼
      for (let i = 0; i < 4; i++) {
        const y = catY + 350 + i * 160
        if (y > worldHeight - 150) break
        const bumper = Bodies.polygon(centerX, y, 5, 22, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: accentColor, lineWidth: 3 }
        })
        bumper.isBumper = true
        bumper.isMoving = true
        bumper.isRotating = true
        bumper.rotateSpeed = 0.04
        bumper.moveSpeed = 2.5 + i * 0.4
        bumper.moveRange = 120
        bumper.startX = centerX
        bumper.moveOffset = i * Math.PI / 3
        obstacles.push(bumper)
      }

      // 사이드 범퍼 - 깜빡임/움직임 번갈아
      for (let row = 0; row < 3; row++) {
        const y = catY + 300 + row * 180
        if (y > worldHeight - 150) break
        const positions = [worldWidth * 0.2, worldWidth * 0.8]
        positions.forEach((x, i) => {
          const bumper = Bodies.circle(x, y + (i * 40), 16, {
            isStatic: true, restitution: 1.9, friction: 0,
            render: { fillStyle: tones[(row + i) % 3], strokeStyle: lightColor, lineWidth: 2 }
          })
          bumper.isBumper = true
          if ((row + i) % 2 === 0) {
            bumper.isBlinking = true
            bumper.blinkPhase = row * Math.PI / 3
            bumper.originalColor = tones[(row + i) % 3]
          } else {
            bumper.isMovingY = true
            bumper.moveSpeedY = 1.6
            bumper.moveRangeY = 30
            bumper.startY = y + (i * 40)
            bumper.moveOffsetY = row * Math.PI / 4
          }
          obstacles.push(bumper)
        })
      }

      // 벽면 범퍼 - 위아래 움직임
      for (let i = 0; i < 5; i++) {
        const y = catY + 150 + i * 150
        if (y > worldHeight - 100) break
        const leftB = Bodies.circle(40, y, 14, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 2 }
        })
        leftB.isBumper = true
        leftB.isMovingY = true
        leftB.moveSpeedY = 1.6 + i * 0.2
        leftB.moveRangeY = 35
        leftB.startY = y
        leftB.moveOffsetY = i * Math.PI / 3
        const rightB = Bodies.circle(worldWidth - 40, y, 14, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: mainColor, strokeStyle: lightColor, lineWidth: 2 }
        })
        rightB.isBumper = true
        rightB.isMovingY = true
        rightB.moveSpeedY = 1.6 + i * 0.2
        rightB.moveRangeY = 35
        rightB.startY = y
        rightB.moveOffsetY = i * Math.PI / 3 + Math.PI
        obstacles.push(leftB, rightB)
      }

      // 회전 + 좌우로 움직이는 삼각형 슬링샷
      const triPositions = [
        { x: worldWidth * 0.22, y: catY + 450 },
        { x: worldWidth * 0.78, y: catY + 450 },
      ]
      triPositions.forEach((pos, i) => {
        if (pos.y > worldHeight - 150) return
        const tri = Bodies.polygon(pos.x, pos.y, 3, 30, {
          isStatic: true, restitution: 2.0, friction: 0,
          render: { fillStyle: darkColor, strokeStyle: mainColor, lineWidth: 3 }
        })
        tri.isBumper = true
        tri.isRotating = true
        tri.rotateSpeed = (i % 2 === 0 ? 1 : -1) * 0.025
        tri.isMoving = true
        tri.moveSpeed = 1.5
        tri.moveRange = 50
        tri.startX = pos.x
        tri.moveOffset = i * Math.PI
        obstacles.push(tri)
      })

      // 스피너 (별)
      for (let i = 0; i < 2; i++) {
        const y = catY + 520 + i * 200
        if (y > worldHeight - 200) break
        const spinner = Bodies.rectangle(centerX, y, 130, 8, {
          isStatic: true, restitution: 1.2, friction: 0,
          render: { fillStyle: lightColor, strokeStyle: darkColor, lineWidth: 2 }
        })
        spinner.isSpinner = true
        spinner.spinSpeed = 0.01
        spinner.maxSpinSpeed = 0.14
        obstacles.push(spinner)
      }

      // 속도 부스터 (별 - 대각선 배치)
      const boosterPositions = [
        { x: worldWidth * 0.2, y: catY + 580 },
        { x: worldWidth * 0.8, y: catY + 580 },
      ]
      boosterPositions.forEach(pos => {
        if (pos.y > worldHeight - 150) return
        const booster = Bodies.rectangle(pos.x, pos.y, 45, 70, {
          isStatic: true, isSensor: true,
          render: { fillStyle: 'rgba(0, 255, 136, 0.4)', strokeStyle: '#00ff88', lineWidth: 3 }
        })
        booster.isBooster = true
        booster.boostPower = 1.5
        obstacles.push(booster)
      })
    }

    // 공 생성 함수
    const createBall = () => {
      const ball = Bodies.circle(
        worldWidth / 2 + (Math.random() - 0.5) * 200,
        worldHeight - 80,
        16,
        {
          restitution: 0.95,
          friction: 0,
          frictionAir: 0,
          render: {
            fillStyle: '#ffffff',
            strokeStyle: '#00d4ff',
            lineWidth: 4
          }
        }
      )
      Body.setVelocity(ball, {
        x: (Math.random() - 0.5) * 5,
        y: -18
      })
      return ball
    }

    // 첫 번째 공
    const firstBall = createBall()
    ballsRef.current = [firstBall]

    Composite.add(engine.world, [...walls, ...brickBodies, ...obstacles, firstBall])

    // 20초마다 공 추가
    ballIntervalRef.current = setInterval(() => {
      if (bricksRef.current.filter(b => !b.destroyed).length > 1) {
        const newBall = createBall()
        ballsRef.current.push(newBall)
        Composite.add(engine.world, newBall)
        addParticles(newBall.position.x, newBall.position.y, '#00d4ff')
      }
    }, 20000)

    // 충돌 감지
    Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        // 범퍼 충돌 체크 - 공을 위로 강하게 밀어냄!
        const bumper = obstacles.find(o => (o === pair.bodyA || o === pair.bodyB) && o.isBumper)
        const hitBall = ballsRef.current.find(b => b === pair.bodyA || b === pair.bodyB)
        if (bumper && hitBall) {
          // 위로 세게 쏘아올림!
          const dx = hitBall.position.x - bumper.position.x
          Body.setVelocity(hitBall, {
            x: hitBall.velocity.x + (dx > 0 ? 3 : -3),
            y: -15  // 위로 강하게!
          })

          // 범퍼 반짝 효과
          addParticles(bumper.position.x, bumper.position.y, bumper.render.fillStyle || '#ff6f61')
        }

        // 스피너 충돌 - 공이 맞으면 빠르게 회전!
        const spinner = obstacles.find(o => (o === pair.bodyA || o === pair.bodyB) && o.isSpinner)
        const spinBall = ballsRef.current.find(b => b === pair.bodyA || b === pair.bodyB)
        if (spinner && spinBall) {
          spinner.spinSpeed = spinner.maxSpinSpeed
          addParticles(spinner.position.x, spinner.position.y, '#fff')
        }

        // 부스터 충돌 - 공 가속!
        const booster = obstacles.find(o => (o === pair.bodyA || o === pair.bodyB) && o.isBooster)
        const boostBall = ballsRef.current.find(b => b === pair.bodyA || b === pair.bodyB)
        if (booster && boostBall) {
          const speed = Math.sqrt(boostBall.velocity.x ** 2 + boostBall.velocity.y ** 2)
          const angle = Math.atan2(boostBall.velocity.y, boostBall.velocity.x)
          const newSpeed = speed * booster.boostPower
          Body.setVelocity(boostBall, {
            x: Math.cos(angle) * newSpeed,
            y: Math.min(Math.sin(angle) * newSpeed, -10) // 최소 위로 향하게
          })
          addParticles(booster.position.x, booster.position.y, '#00ff88')
        }

        // 깨지는 장애물 블록 체크
        const breakable = breakableBlocks.find(b => (b === pair.bodyA || b === pair.bodyB) && !b.destroyed)
        if (breakable) {
          breakable.destroyed = true
          addParticles(breakable.position.x, breakable.position.y, '#ffc107')
          Composite.remove(engine.world, breakable)
        }

        // 참가자 블록 체크
        const brick = bricksRef.current.find(b => b === pair.bodyA || b === pair.bodyB)
        if (brick && !brick.destroyed) {
          brick.destroyed = true
          const brickName = brick.name
          const brickColor = brick.color

          addParticles(brick.position.x, brick.position.y, brickColor)
          Composite.remove(engine.world, brick)
          bricksRef.current = bricksRef.current.filter(b => b !== brick)

          setBricks(prev => {
            const idx = prev.findIndex(b => b.name === brickName && b.alive)
            if (idx !== -1) {
              const updated = [...prev]
              updated[idx] = { ...updated[idx], alive: false }
              return updated
            }
            return prev
          })

          setTimeout(() => {
            const remaining = bricksRef.current.filter(b => !b.destroyed)

            if (!isLastSurvivor && remaining.length === nameList.length - 1) {
              setWinner(brickName)
              setGameState('finished')
            } else if (isLastSurvivor && remaining.length === 1) {
              setWinner(remaining[0].name)
              setGameState('finished')
            } else if (remaining.length === 0) {
              setWinner(brickName)
              setGameState('finished')
            }
          }, 100)
        }
      })
    })

    // 카메라 따라다니기 + 바닥 체크 + 장애물 애니메이션
    Events.on(engine, 'beforeUpdate', () => {
      const time = engine.timing.timestamp / 1000

      // 장애물 애니메이션
      obstacles.forEach(o => {
        if (o.isRotating) {
          Body.setAngle(o, o.angle + o.rotateSpeed)
        }
        if (o.isMoving) {
          const newX = o.startX + Math.sin(time * o.moveSpeed + o.moveOffset) * o.moveRange
          Body.setPosition(o, { x: newX, y: o.position.y })
        }
        if (o.isMovingY) {
          const newY = o.startY + Math.sin(time * o.moveSpeedY + (o.moveOffsetY || 0)) * o.moveRangeY
          Body.setPosition(o, { x: o.position.x, y: newY })
        }
        // 깜빡이는 범퍼
        if (o.isBlinking) {
          const blinkValue = Math.sin(time * 3 + o.blinkPhase)
          const isVisible = blinkValue > 0
          o.render.visible = isVisible
          // 충돌 마스크 토글
          if (isVisible) {
            o.collisionFilter.mask = 0xFFFFFFFF
            o.render.opacity = 0.3 + Math.abs(blinkValue) * 0.7
          } else {
            o.collisionFilter.mask = 0
            o.render.opacity = 0.1
          }
        }
        // 스피너 회전 + 감속
        if (o.isSpinner) {
          Body.setAngle(o, o.angle + o.spinSpeed)
          o.spinSpeed = Math.max(0.01, o.spinSpeed * 0.995) // 천천히 감속
        }
      })

      // 공 트레일 저장
      ballsRef.current.forEach(ball => {
        if (!ballTrailsRef.current[ball.id]) {
          ballTrailsRef.current[ball.id] = []
        }
        ballTrailsRef.current[ball.id].push({
          x: ball.position.x,
          y: ball.position.y
        })
        // 최대 15개 위치만 저장
        if (ballTrailsRef.current[ball.id].length > 15) {
          ballTrailsRef.current[ball.id].shift()
        }
      })

      if (ballsRef.current.length > 0 && renderRef.current) {
        // 모든 공 바닥 체크
        ballsRef.current.forEach(b => {
          if (b.position.y > worldHeight - 50) {
            Body.setVelocity(b, {
              x: (Math.random() - 0.5) * 5,
              y: -18
            })
          }
        })

        // 카메라는 블록에 가장 가까운 공 (Y가 가장 작은 공) 따라다님
        const closestBall = ballsRef.current.reduce((closest, ball) => {
          return ball.position.y < closest.position.y ? ball : closest
        }, ballsRef.current[0])

        const targetY = closestBall.position.y - viewHeight / 2
        const clampedY = Math.max(0, Math.min(worldHeight - viewHeight, targetY))

        Render.lookAt(renderRef.current, {
          min: { x: 0, y: clampedY },
          max: { x: viewWidth, y: clampedY + viewHeight }
        })
      }
    })

    // 블록에 이름 그리기 + 공 트레일
    Events.on(render, 'afterRender', () => {
      const context = render.context
      const bounds = render.bounds

      // 공 트레일 그리기
      context.save()
      ballsRef.current.forEach(ball => {
        const trail = ballTrailsRef.current[ball.id]
        if (trail && trail.length > 1) {
          trail.forEach((pos, i) => {
            const x = pos.x - bounds.min.x
            const y = pos.y - bounds.min.y
            const alpha = (i / trail.length) * 0.6
            const size = (i / trail.length) * 12 + 4

            context.beginPath()
            context.arc(x, y, size, 0, Math.PI * 2)
            context.fillStyle = `rgba(0, 212, 255, ${alpha})`
            context.fill()
          })
        }
      })
      context.restore()

      // 이름 그리기
      bricksRef.current.forEach(brick => {
        if (!brick.destroyed) {
          context.save()

          // 화면 좌표로 변환
          const x = brick.position.x - bounds.min.x
          const y = brick.position.y - bounds.min.y

          // 이름 길이에 따라 폰트 크기 조절
          const radius = brick.radius || 30
          let fontSize = 12
          if (brick.name.length > 4) fontSize = 10
          if (brick.name.length > 6) fontSize = 8

          context.font = `bold ${fontSize}px 'Segoe UI', sans-serif`
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillStyle = '#ffffff'
          context.shadowColor = 'rgba(0,0,0,0.8)'
          context.shadowBlur = 3
          context.shadowOffsetX = 0
          context.shadowOffsetY = 0
          context.fillText(brick.name, x, y)

          context.restore()
        }
      })
    })

    const runner = Runner.create()
    runnerRef.current = runner

    Render.run(render)
    Runner.run(runner, engine)

    return () => {
      if (ballIntervalRef.current) clearInterval(ballIntervalRef.current)
      if (runnerRef.current) Runner.stop(runnerRef.current)
      if (renderRef.current) Render.stop(renderRef.current)
    }
  }, [gameState, addParticles])

  const startGame = useCallback(() => {
    const nameList = getNameList()
    if (nameList.length < 2) {
      alert('최소 2명 이상의 이름을 입력해주세요!')
      return
    }

    gameDataRef.current = {
      nameList,
      isLastSurvivor: lastSurvivor,
      mapType: selectedMap
    }

    setWinner(null)
    setBricks(nameList.map((name, i) => ({
      name,
      color: COLORS[nameList.indexOf(name) % COLORS.length],
      alive: true
    })))
    setParticles([])
    setGameState('playing')
  }, [getNameList, lastSurvivor, selectedMap])

  const resetGame = useCallback(() => {
    if (ballIntervalRef.current) {
      clearInterval(ballIntervalRef.current)
      ballIntervalRef.current = null
    }
    if (engineRef.current) {
      Matter.Composite.clear(engineRef.current.world)
      Matter.Engine.clear(engineRef.current)
    }
    if (renderRef.current) {
      Matter.Render.stop(renderRef.current)
      if (renderRef.current.canvas) {
        renderRef.current.canvas.remove()
      }
    }
    if (runnerRef.current) {
      Matter.Runner.stop(runnerRef.current)
    }

    gameDataRef.current = null
    setGameState('idle')
    setWinner(null)
    setBricks([])
    setParticles([])
    bricksRef.current = []
    ballTrailsRef.current = {}
  }, [])

  return (
    <div className="app">
      <h1 className="title">LAST ONE</h1>
      <p className="subtitle">Pinball Lottery</p>

      {gameState === 'idle' && (
        <div className="setup">
          <div className="input-section">
            <label>참가자 이름 (쉼표 또는 줄바꿈으로 구분, *숫자로 여러개)</label>
            <textarea
              value={names}
              onChange={(e) => setNames(e.target.value)}
              placeholder="예: 토끼*3, 햄스터*2, 호랑이"
              rows={5}
            />
            <p className="hint">💡 토끼*3 = 토끼 블록 3개 생성</p>
          </div>

          <div className="map-section">
            <label>맵 선택</label>
            <div className="map-buttons">
              <button
                className={`map-btn ${selectedMap === 'cat' ? 'active' : ''}`}
                onClick={() => setSelectedMap('cat')}
              >
                <span className="map-icon">😺</span>
                <span className="map-name">고양이</span>
              </button>
              <button
                className={`map-btn ${selectedMap === 'octopus' ? 'active' : ''}`}
                onClick={() => setSelectedMap('octopus')}
              >
                <span className="map-icon">🐙</span>
                <span className="map-name">문어</span>
              </button>
              <button
                className={`map-btn ${selectedMap === 'star' ? 'active' : ''}`}
                onClick={() => setSelectedMap('star')}
              >
                <span className="map-icon">⭐</span>
                <span className="map-name">별</span>
              </button>
            </div>
          </div>

          <div className="toggle-section">
            <span className={!lastSurvivor ? 'active' : ''}>먼저 깨진 = 당첨</span>
            <label className="toggle">
              <input
                type="checkbox"
                checked={lastSurvivor}
                onChange={(e) => setLastSurvivor(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
            <span className={lastSurvivor ? 'active' : ''}>마지막 생존 = 당첨</span>
          </div>

          <button className="start-btn" onClick={startGame}>
            START
          </button>
        </div>
      )}

      {gameState !== 'idle' && (
        <div className="game-container">
          <div className="canvas-wrapper" ref={canvasRef}>
            <div className="particles">
              {particles.map(p => (
                <div
                  key={p.id}
                  className="particle"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                    opacity: p.life
                  }}
                />
              ))}
            </div>
          </div>

          <div className="sidebar">
            <h3>참가자 목록</h3>
            <div className="brick-list">
              {bricks.map((brick, i) => (
                <div
                  key={i}
                  className={`brick-item ${!brick.alive ? 'destroyed' : ''}`}
                  style={{ borderLeftColor: brick.color }}
                >
                  {brick.name}
                  {!brick.alive && <span className="out-badge">OUT</span>}
                </div>
              ))}
            </div>

            {gameState === 'playing' && (
              <button className="reset-btn" onClick={resetGame}>
                취소
              </button>
            )}
          </div>
        </div>
      )}

      {gameState === 'finished' && (
        <div className="winner-overlay">
          <div className="winner-modal">
            <div className="confetti"></div>
            <h2>WINNER!</h2>
            <div className="winner-name">{winner}</div>
            <p className="winner-type">
              {lastSurvivor ? '마지막까지 살아남음!' : '가장 먼저 선택됨!'}
            </p>
            <button className="restart-btn" onClick={resetGame}>
              다시 하기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
