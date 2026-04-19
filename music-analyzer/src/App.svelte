<script>
  import { onMount } from 'svelte';
  import { login, getToken, fetchSpotify } from './lib/spotify.js';
  import { Chart, registerables } from 'chart.js';
  Chart.register(...registerables);

  let token = localStorage.getItem('spotify_token');
  let user = null;
  let topTracks = [];
  let topArtists = [];
  let loading = false;
  let activeTab = 'overview';
  let currentTrack = null;
  let isPlaying = false;
  let progressWidth = 38;

  let moodChart, popularityChart;

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code && !token) {
      loading = true;
      const data = await getToken(code);
      token = data.access_token;
      localStorage.setItem('spotify_token', token);
      window.history.replaceState({}, '', '/');
    }

    if (token) {
      loading = true;
      const [userData, tracksData, artistsData] = await Promise.all([
        fetchSpotify('/me', token),
        fetchSpotify('/me/top/tracks?limit=10&time_range=short_term', token),
        fetchSpotify('/me/top/artists?limit=8&time_range=short_term', token),
      ]);
      user = userData;
      topTracks = tracksData.items || [];
      topArtists = artistsData.items || [];
      if (topTracks.length > 0) currentTrack = topTracks[0];
      loading = false;
      setTimeout(() => {
        drawPopularityChart();
        drawMoodChart();
      }, 500);
    }
  });

  function drawPopularityChart() {
    const canvas = document.getElementById('popularityChart');
    if (!canvas) return;
    if (popularityChart) popularityChart.destroy();
    const labels = topTracks.slice(0, 7).map(t =>
            t.name.length > 12 ? t.name.slice(0, 12) + '...' : t.name
    );
    popularityChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Популарност',
          data: topTracks.slice(0, 7).map(t => t.popularity),
          backgroundColor: '#ff4d7d',
          borderRadius: 8,
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { color: '#7b7b9a' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { ticks: { color: '#7b7b9a', font: { size: 10 } }, grid: { display: false } }
        }
      }
    });
  }

  function drawMoodChart() {
    const canvas = document.getElementById('moodChart');
    if (!canvas) return;
    if (moodChart) moodChart.destroy();
    const avgPop = topTracks.reduce((s, t) => s + t.popularity, 0) / (topTracks.length || 1);
    const avgDur = topTracks.reduce((s, t) => s + t.duration_ms, 0) / (topTracks.length || 1);
    const explicit = topTracks.filter(t => t.explicit).length / (topTracks.length || 1) * 100;
    const newReleases = topTracks.filter(t => new Date(t.album.release_date).getFullYear() >= 2023).length / (topTracks.length || 1) * 100;
    const variety = Math.min(100, new Set(topArtists.map(a => a.genres?.[0])).size / 5 * 100);
    const underground = topArtists.filter(a => a.popularity < 60).length / (topArtists.length || 1) * 100;
    moodChart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: ['Популарност', 'Должина', 'Explicit', 'Разновидност', 'Нови', 'Независни'],
        datasets: [{
          data: [
            Math.round(avgPop),
            Math.min(100, Math.round(avgDur / 3000)),
            Math.round(explicit),
            Math.round(variety),
            Math.round(newReleases),
            Math.round(underground),
          ],
          backgroundColor: 'rgba(255,77,125,0.15)',
          borderColor: '#ff4d7d',
          pointBackgroundColor: '#ff4d7d',
          borderWidth: 2,
        }]
      },
      options: {
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { display: false },
            grid: { color: 'rgba(255,255,255,0.07)' },
            pointLabels: { color: '#7b7b9a', font: { size: 10 } }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  function getMoodEmoji() {
    const avgPop = topTracks.reduce((s, t) => s + t.popularity, 0) / (topTracks.length || 1);
    const explicit = topTracks.filter(t => t.explicit).length / (topTracks.length || 1) * 100;
    if (avgPop > 75 && explicit > 30) return { emoji: '🔥', label: 'Mainstream хит' };
    if (avgPop > 75) return { emoji: '⭐', label: 'Популарен вкус' };
    if (avgPop < 40) return { emoji: '🎸', label: 'Инди слушач' };
    if (explicit > 50) return { emoji: '😤', label: 'Интензивен' };
    return { emoji: '😌', label: 'Балансиран' };
  }

  function getTotalMinutes() {
    return Math.round(topTracks.reduce((s, t) => s + t.duration_ms, 0) / 60000);
  }

  function formatDuration(ms) {
    return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  }

  function playTrack(track) {
    currentTrack = track;
    isPlaying = true;
  }

  function togglePlay() {
    isPlaying = !isPlaying;
  }

  function setTab(tab) {
    activeTab = tab;
    if (tab === 'mood') setTimeout(drawMoodChart, 100);
    if (tab === 'overview') setTimeout(drawPopularityChart, 100);
  }

  function logout() {
    localStorage.clear();
    token = null;
    user = null;
    topTracks = [];
    topArtists = [];
    currentTrack = null;
  }

  const gradients = [
    'linear-gradient(135deg,#1a0533,#6b21a8)',
    'linear-gradient(135deg,#7f1d1d,#ec4899)',
    'linear-gradient(135deg,#0f172a,#3b82f6)',
    'linear-gradient(135deg,#052e16,#15803d)',
    'linear-gradient(135deg,#1e1b4b,#6366f1)',
    'linear-gradient(135deg,#451a03,#f97316)',
    'linear-gradient(135deg,#4a044e,#ec4899)',
    'linear-gradient(135deg,#0c4a6e,#06b6d4)',
  ];
</script>

{#if !token}
  <div class="login">
    <div class="logo">🎵</div>
    <h1>Music Analyzer</h1>
    <p>Откриј ги твоите музички навики</p>
    <button class="spotify-btn" on:click={login}>Поврзи со Spotify</button>
  </div>

{:else if loading}
  <div class="login">
    <div class="spinner"></div>
    <p>Вчитување...</p>
  </div>

{:else}
  <div class="app">

    <!-- NAV -->
    <div class="nav">
      <div class="nav-left">
        <span class="nav-logo">🎵</span>
        <span class="nav-title">Music Analyzer</span>
      </div>
      <div class="tabs">
        <button class:active={activeTab === 'overview'} on:click={() => setTab('overview')}>Преглед</button>
        <button class:active={activeTab === 'tracks'} on:click={() => setTab('tracks')}>Песни</button>
        <button class:active={activeTab === 'artists'} on:click={() => setTab('artists')}>Артисти</button>
        <button class:active={activeTab === 'mood'} on:click={() => setTab('mood')}>Mood</button>
      </div>
      <div class="nav-right">
        {#if user?.images?.[0]?.url}
          <img src={user.images[0].url} alt={user.display_name} class="avatar" />
        {:else}
          <div class="avatar-placeholder">👤</div>
        {/if}
        <span class="username">{user?.display_name}</span>
        <button class="logout-btn" on:click={logout}>Одјави се</button>
      </div>
    </div>

    <!-- STATS -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-num">{topTracks.length}</span>
        <span class="stat-label">Топ песни</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{topArtists.length}</span>
        <span class="stat-label">Топ артисти</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{getTotalMinutes()}м</span>
        <span class="stat-label">Минути</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{getMoodEmoji().emoji}</span>
        <span class="stat-label">{getMoodEmoji().label}</span>
      </div>
    </div>

    <!-- CONTENT -->
    <div class="content">

      {#if activeTab === 'overview'}

        <!-- Top Albums row -->
        <div class="section">
          <div class="section-header">
            <h3>Топ албуми</h3>
          </div>
          <div class="albums-row">
            {#each topTracks.slice(0, 6) as track, i}
              <div class="album-card" class:active-album={currentTrack?.id === track.id} on:click={() => playTrack(track)}>
                <div class="album-thumb">
                  {#if track.album.images?.[0]?.url}
                    <img src={track.album.images[0].url} alt={track.album.name} />
                  {:else}
                    <div class="album-thumb-placeholder" style="background:{gradients[i % gradients.length]}">🎵</div>
                  {/if}
                  <div class="play-overlay"><div class="play-btn-circle">▶</div></div>
                </div>
                <div class="album-name">{track.album.name.length > 14 ? track.album.name.slice(0,14)+'...' : track.album.name}</div>
                <div class="album-artist">{track.artists[0].name}</div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Chart -->
        <div class="section">
          <div class="section-header"><h3>Популарност на топ песни</h3></div>
          <div class="chart-box">
            <canvas id="popularityChart"></canvas>
          </div>
        </div>

      {:else if activeTab === 'tracks'}
        <div class="section">
          <div class="section-header"><h3>Твоите топ песни</h3></div>
          <div class="track-list">
            {#each topTracks as track, i}
              <div class="track-item" class:playing={currentTrack?.id === track.id} on:click={() => playTrack(track)}>
                <span class="rank">#{i + 1}</span>
                <div class="track-thumb">
                  {#if track.album.images?.[2]?.url}
                    <img src={track.album.images[2].url} alt={track.name} />
                  {:else}
                    <div class="thumb-placeholder" style="background:{gradients[i % gradients.length]}">🎵</div>
                  {/if}
                </div>
                <div class="track-info">
                  <div class="track-name">{track.name}</div>
                  <div class="track-artist">{track.artists[0].name} · {track.album.name}</div>
                </div>
                {#if currentTrack?.id === track.id}
                  <div class="playing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                {/if}
                <span class="duration">{formatDuration(track.duration_ms)}</span>
                <span class="pop-badge">{track.popularity}</span>
              </div>
            {/each}
          </div>
        </div>

      {:else if activeTab === 'artists'}
        <div class="section">
          <div class="section-header"><h3>Твоите топ артисти</h3></div>
          <div class="artists-grid">
            {#each topArtists as artist, i}
              <div class="artist-card">
                {#if artist.images?.[0]?.url}
                  <img src={artist.images[0].url} alt={artist.name} />
                {:else}
                  <div class="artist-placeholder" style="background:{gradients[i % gradients.length]}">🎤</div>
                {/if}
                <span class="artist-name">{artist.name}</span>
                <span class="artist-rank">#{i + 1}</span>
                {#if artist.genres?.[0]}
                  <span class="genre">{artist.genres[0]}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>

      {:else if activeTab === 'mood'}
        <div class="section">
          <div class="section-header"><h3>Твој музички профил</h3></div>
          <div class="mood-top">
            <span class="big-emoji">{getMoodEmoji().emoji}</span>
            <span class="mood-label">{getMoodEmoji().label}</span>
          </div>
          <div class="chart-box">
            <canvas id="moodChart"></canvas>
          </div>
          <div class="mood-bars">
            {#each [
              ['Просечна популарност', Math.round(topTracks.reduce((s,t)=>s+t.popularity,0)/(topTracks.length||1))],
              ['Explicit содржина', Math.round(topTracks.filter(t=>t.explicit).length/(topTracks.length||1)*100)],
              ['Нови изданија (2023+)', Math.round(topTracks.filter(t=>new Date(t.album.release_date).getFullYear()>=2023).length/(topTracks.length||1)*100)],
              ['Независни артисти', Math.round(topArtists.filter(a=>a.popularity<60).length/(topArtists.length||1)*100)],
            ] as [label, val]}
              <div class="mood-bar-row">
                <span>{label}</span>
                <div class="bar-bg"><div class="bar-fill" style="width:{val}%"></div></div>
                <span class="pct">{val}%</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- PLAYER BAR -->
    {#if currentTrack}
      <div class="player-bar">
        <div class="player-track">
          {#if currentTrack.album.images?.[2]?.url}
            <img src={currentTrack.album.images[2].url} alt={currentTrack.name} class="player-thumb" />
          {:else}
            <div class="player-thumb-placeholder">🎵</div>
          {/if}
          <div class="player-info">
            <div class="player-name">{currentTrack.name}</div>
            <div class="player-artist">{currentTrack.artists[0].name}</div>
          </div>
        </div>
        <div class="player-controls">
          <div class="ctrl-btns">
            <button class="ctrl-btn">⏮</button>
            <button class="play-main" on:click={togglePlay}>{isPlaying ? '⏸' : '▶'}</button>
            <button class="ctrl-btn">⏭</button>
          </div>
          <div class="progress-wrap">
            <span class="time">0:00</span>
            <div class="progress-track">
              <div class="progress-fill" style="width:{progressWidth}%"></div>
            </div>
            <span class="time">{formatDuration(currentTrack.duration_ms)}</span>
          </div>
        </div>
        <div class="player-right">
          <span>🔊</span>
          <div class="vol-track"><div class="vol-fill"></div></div>
        </div>
      </div>
    {/if}

  </div>
{/if}

<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :global(body) {
    background: #0d0d14;
    color: white;
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
  }

  .login {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100vh; gap: 16px;
    background: #0d0d14; color: white;
  }
  .logo { font-size: 4rem; }
  .login h1 { font-family: 'Syne', sans-serif; font-size: 2.2rem; }
  .login p { color: #7b7b9a; }
  .spinner {
    width: 40px; height: 40px; border: 3px solid #222;
    border-top-color: #ff4d7d; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .spotify-btn {
    background: #1DB954; color: white; border: none;
    padding: 14px 36px; border-radius: 50px;
    font-size: 16px; font-family: 'DM Sans', sans-serif;
    cursor: pointer; font-weight: 500;
  }
  .spotify-btn:hover { background: #1aa34a; }

  .app {
    max-width: 900px; margin: 0 auto;
    padding: 0 16px 100px; min-height: 100vh;
  }

  /* NAV */
  .nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 0; margin-bottom: 20px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    position: sticky; top: 0; background: rgba(13,13,20,0.95);
    backdrop-filter: blur(20px); z-index: 100;
  }
  .nav-left { display: flex; align-items: center; gap: 10px; }
  .nav-logo { font-size: 1.4rem; }
  .nav-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 1.1rem; }
  .nav-right { display: flex; align-items: center; gap: 10px; }
  .avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
  .avatar-placeholder {
    width: 36px; height: 36px; border-radius: 50%;
    background: linear-gradient(135deg, #ff4d7d, #a855f7);
    display: flex; align-items: center; justify-content: center;
  }
  .username { font-size: 13px; color: #aaa; }
  .logout-btn {
    background: transparent; color: #666; border: 1px solid #333;
    padding: 6px 14px; border-radius: 50px; cursor: pointer; font-size: 12px;
    font-family: 'DM Sans', sans-serif;
  }
  .logout-btn:hover { color: white; border-color: #555; }

  /* TABS */
  .tabs { display: flex; gap: 6px; }
  .tabs button {
    background: rgba(255,255,255,0.05); color: #7b7b9a;
    border: none; padding: 8px 16px; border-radius: 50px;
    cursor: pointer; font-size: 13px; font-family: 'DM Sans', sans-serif;
    transition: all 0.2s;
  }
  .tabs button.active { background: #ff4d7d; color: white; }
  .tabs button:hover:not(.active) { color: white; background: rgba(255,255,255,0.1); }

  /* STATS */
  .stats-row {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 12px; margin-bottom: 24px;
  }
  .stat-card {
    background: #13131f; border-radius: 14px; padding: 16px;
    text-align: center; border: 1px solid rgba(255,255,255,0.05);
  }
  .stat-num { display: block; font-size: 1.8rem; font-weight: 700; color: #ff4d7d; font-family: 'Syne', sans-serif; }
  .stat-label { font-size: 0.75rem; color: #7b7b9a; margin-top: 4px; display: block; }

  .content { display: flex; flex-direction: column; gap: 28px; }

  .section-header { margin-bottom: 16px; }
  .section-header h3 { font-family: 'Syne', sans-serif; font-size: 1.1rem; font-weight: 700; }

  /* ALBUMS */
  .albums-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
  .album-card { cursor: pointer; transition: transform 0.2s; }
  .album-card:hover { transform: translateY(-4px); }
  .album-card:hover .play-overlay { opacity: 1; }
  .album-thumb {
    position: relative; border-radius: 12px; overflow: hidden;
    aspect-ratio: 1; margin-bottom: 8px;
  }
  .album-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .album-thumb-placeholder {
    width: 100%; height: 100%; display: flex; align-items: center;
    justify-content: center; font-size: 2rem;
  }
  .play-overlay {
    position: absolute; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s;
  }
  .play-btn-circle {
    width: 40px; height: 40px; border-radius: 50%; background: #ff4d7d;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; box-shadow: 0 4px 20px rgba(255,77,125,0.5);
  }
  .active-album .album-thumb { box-shadow: 0 0 0 2px #ff4d7d; }
  .active-album .album-name { color: #ff4d7d; }
  .album-name { font-size: 12px; font-weight: 600; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .album-artist { font-size: 11px; color: #7b7b9a; }

  /* CHART */
  .chart-box {
    background: #13131f; border-radius: 14px; padding: 16px;
    border: 1px solid rgba(255,255,255,0.05);
  }

  /* TRACKS */
  .track-list { display: flex; flex-direction: column; gap: 2px; }
  .track-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: 10px; cursor: pointer;
    transition: background 0.15s;
  }
  .track-item:hover { background: rgba(255,255,255,0.05); }
  .track-item.playing {
    background: linear-gradient(90deg, rgba(255,77,125,0.12), transparent);
    border: 1px solid rgba(255,77,125,0.2);
  }
  .rank { color: #ff4d7d; font-weight: 700; width: 28px; font-size: 13px; font-family: 'Syne', sans-serif; }
  .track-thumb { width: 46px; height: 46px; border-radius: 8px; overflow: hidden; flex-shrink: 0; }
  .track-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .thumb-placeholder {
    width: 100%; height: 100%; display: flex; align-items: center;
    justify-content: center; font-size: 1.2rem;
  }
  .track-info { flex: 1; min-width: 0; }
  .track-name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track-artist { font-size: 12px; color: #7b7b9a; }
  .track-item.playing .track-name { color: #ff4d7d; }
  .duration { font-size: 12px; color: #555; }
  .pop-badge {
    background: rgba(255,77,125,0.15); color: #ff4d7d;
    font-size: 11px; font-weight: 700; padding: 3px 10px;
    border-radius: 50px;
  }

  /* PLAYING INDICATOR */
  .playing-indicator { display: flex; gap: 2px; align-items: flex-end; height: 16px; }
  .playing-indicator span {
    display: block; width: 3px; background: #ff4d7d; border-radius: 2px;
    animation: bounce 0.8s ease infinite;
  }
  .playing-indicator span:nth-child(2) { animation-delay: 0.15s; }
  .playing-indicator span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes bounce { 0%,100%{height:4px} 50%{height:14px} }

  /* ARTISTS */
  .artists-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .artist-card {
    background: #13131f; border-radius: 14px; padding: 14px;
    text-align: center; border: 1px solid rgba(255,255,255,0.05);
    transition: transform 0.2s;
  }
  .artist-card:hover { transform: translateY(-3px); }
  .artist-card img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 50%; margin-bottom: 10px; }
  .artist-placeholder {
    width: 100%; aspect-ratio: 1; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 2rem; margin-bottom: 10px;
  }
  .artist-name { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .artist-rank { display: block; font-size: 11px; color: #ff4d7d; }
  .genre { display: block; font-size: 10px; color: #555; margin-top: 3px; }

  /* MOOD */
  .mood-top { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 16px; }
  .big-emoji { font-size: 3rem; }
  .mood-label { font-family: 'Syne', sans-serif; font-size: 1.2rem; color: #ff4d7d; font-weight: 700; }
  .mood-bars { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
  .mood-bar-row { display: flex; align-items: center; gap: 12px; }
  .mood-bar-row span:first-child { width: 180px; font-size: 12px; color: #aaa; flex-shrink: 0; }
  .bar-bg { flex: 1; background: rgba(255,255,255,0.07); border-radius: 50px; height: 6px; }
  .bar-fill { background: #ff4d7d; height: 6px; border-radius: 50px; transition: width 0.6s ease; }
  .pct { width: 36px; font-size: 12px; color: #555; text-align: right; }

  /* PLAYER */
  .player-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: rgba(13,13,20,0.97); backdrop-filter: blur(30px);
    border-top: 1px solid rgba(255,255,255,0.07);
    padding: 12px 28px; display: flex; align-items: center; gap: 20px; z-index: 200;
  }
  .player-track { display: flex; align-items: center; gap: 12px; width: 240px; }
  .player-thumb { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
  .player-thumb-placeholder {
    width: 44px; height: 44px; border-radius: 8px;
    background: linear-gradient(135deg, #ff4d7d, #a855f7);
    display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;
  }
  .player-info { min-width: 0; }
  .player-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .player-artist { font-size: 11px; color: #7b7b9a; }
  .player-controls { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .ctrl-btns { display: flex; align-items: center; gap: 16px; }
  .ctrl-btn {
    background: none; border: none; color: #7b7b9a;
    font-size: 18px; cursor: pointer; transition: color 0.15s;
  }
  .ctrl-btn:hover { color: white; }
  .play-main {
    width: 36px; height: 36px; border-radius: 50%;
    background: white; border: none; cursor: pointer;
    font-size: 14px; color: black; display: flex;
    align-items: center; justify-content: center;
    transition: transform 0.15s;
  }
  .play-main:hover { transform: scale(1.08); }
  .progress-wrap { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 380px; }
  .time { font-size: 11px; color: #555; }
  .progress-track { flex: 1; height: 3px; background: rgba(255,255,255,0.12); border-radius: 3px; }
  .progress-fill { height: 100%; background: white; border-radius: 3px; }
  .player-right { display: flex; align-items: center; gap: 10px; width: 160px; justify-content: flex-end; color: #7b7b9a; font-size: 16px; }
  .vol-track { width: 70px; height: 3px; background: rgba(255,255,255,0.12); border-radius: 3px; }
  .vol-fill { height: 100%; width: 70%; background: white; border-radius: 3px; }
</style>