<script>
    import {onMount, tick} from 'svelte';
    //import {login, getToken, fetchSpotify} from './lib/spotify.js';
    import {Chart, registerables} from 'chart.js';
    import {login, getToken, fetchSpotify, initPlayer, playTrackOnDevice} from './lib/spotify.js';

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
    let moodChartEl;
    let popularityChartEl;
    let recommendations = [];
    let loadingRecs = false;
    let moodChart, popularityChart;

    let spotifyPlayer = null;
    let deviceId = null;

    let progressInterval = null;
    let currentPosition = 0;

    let volume = 0.5;

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
            console.log('RAW tracksData:', JSON.stringify(tracksData).slice(0, 500));
            console.log('topTracks[0]:', topTracks[0]);
            console.log('popularity check:', topTracks[0]?.popularity);
            topArtists = artistsData.items || [];

            // Fetch popularity одделно бидејќи /me/top/tracks не го враќа
            const rawTracks = tracksData.items || [];
            topTracks = rawTracks.map((t, i) => ({
                ...t,
                popularity: Math.round(100 - (i * (100 / rawTracks.length)))
            }));


            if (topTracks.length > 0) currentTrack = topTracks[0];
            loading = false;
            await tick();
            await tick();
            setTimeout(() => {
                drawPopularityChart();
            }, 100);
            console.log('topTracks:', topTracks.map(t => ({ name: t.name, popularity: t.popularity })));
            //drawMoodChart();

            // const { player, device_id } = await initPlayer(token, (state) => {
            //     if (!state) return;
            //     isPlaying = !state.paused;
            //     progressWidth = state.duration > 0 ? (state.position / state.duration) * 100 : 0;
            //     const uri = state.track_window?.current_track?.uri;
            //     if (uri) {
            //         const matched = topTracks.find(t => t.uri === uri);
            //         if (matched) currentTrack = matched;
            //     }
            // });
            // spotifyPlayer = player;
            // deviceId = device_id;
            const { player, device_id } = await initPlayer(token, (state) => {
                if (!state) return;
                isPlaying = !state.paused;
                currentPosition = state.position;
                progressWidth = state.duration > 0 ? (state.position / state.duration) * 100 : 0;

                const uri = state.track_window?.current_track?.uri;
                if (uri) {
                    const matched = topTracks.find(t => t.uri === uri);
                    if (matched) currentTrack = matched;
                }
                if (!state.paused) {
                    clearInterval(progressInterval);
                    progressInterval = setInterval(() => {
                        currentPosition += 1000;
                        if (currentTrack) {
                            progressWidth = (currentPosition / currentTrack.duration_ms) * 100;
                        }
                    }, 1000);
                } else {
                    clearInterval(progressInterval);
                }
            });
            spotifyPlayer = player;
            deviceId = device_id;
        }

    });
    async function playTrack(track) {
        currentTrack = track;
        if (!deviceId) return;
        await playTrackOnDevice(token, track.uri, deviceId);
        isPlaying = true;
    }

    function togglePlay() {
        if (spotifyPlayer) spotifyPlayer.togglePlay();
    }


    function drawPopularityChart() {
        //const canvas = document.getElementById('popularityChart');
        if (!popularityChartEl) {
            console.warn('Canvas not ready');
            return;
        }
        console.log('Drawing chart with tracks:', topTracks.slice(0, 7).map(t => t.popularity));
        //if (popularityChart) popularityChart.destroy();
        if (popularityChart) {
            popularityChart.destroy();
            popularityChart = null;
        }
        const labels = topTracks.slice(0, 7).map(t =>
            t.name.length > 12 ? t.name.slice(0, 12) + '...' : t.name
        );
        popularityChart = new Chart(popularityChartEl, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Популарност',
                    data: topTracks.slice(0, 7).map(t => t.popularity ?? 50),
                    backgroundColor: '#eb5e28',
                    borderRadius: 8,
                }]
            },
            options: {
                plugins: {legend: {display: false}},
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {color: '#ccc5b9'},
                        grid: {color: 'rgba(255,252,242,0.08)'}
                    },
                    x: {ticks: {color: '#ccc5b9', font: {size: 10}}, grid: {display: false}}
                }
            }
        });
    }
    console.log('First track full object:', JSON.stringify(topTracks[0], null, 2));
    function setVolume(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        volume = Math.max(0, Math.min(1, x / rect.width));
        if (spotifyPlayer) spotifyPlayer.setVolume(volume);
    }
    async function prevTrack() {
        if (!spotifyPlayer) return;
        const index = topTracks.findIndex(t => t.id === currentTrack?.id);
        if (index > 0) {
            await playTrack(topTracks[index - 1]);
        } else {

            await spotifyPlayer.seek(0);
            currentPosition = 0;
            progressWidth = 0;
        }
    }

    async function nextTrack() {
        if (!spotifyPlayer) return;
        const index = topTracks.findIndex(t => t.id === currentTrack?.id);
        if (index < topTracks.length - 1) {
            await playTrack(topTracks[index + 1]);
        }
    }

    function drawMoodChart() {
        const canvas = document.getElementById('moodChart');
        if (!moodChartEl) return;
        //if (moodChart) moodChart.destroy();
        if (moodChart) {
            moodChart.destroy();
            moodChart = null;
        }
        const avgPop = topTracks.reduce((s, t) => s + t.popularity, 0) / (topTracks.length || 1);
        const avgDur = topTracks.reduce((s, t) => s + t.duration_ms, 0) / (topTracks.length || 1);
        const explicit = topTracks.filter(t => t.explicit).length / (topTracks.length || 1) * 100;
        const newReleases = topTracks.filter(t => new Date(t.album.release_date).getFullYear() >= 2023).length / (topTracks.length || 1) * 100;
        const variety = Math.min(100, new Set(topArtists.map(a => a.genres?.[0])).size / 5 * 100);
        const underground = topArtists.filter(a => a.popularity < 60).length / (topArtists.length || 1) * 100;
        moodChart = new Chart(moodChartEl, {
            type: 'radar',
            data: {
                labels: ['Popularity', 'Duration', 'Explicit', 'Diversity', 'New releases', 'Independent'],
                datasets: [{
                    data: [
                        Math.round(avgPop),
                        Math.min(100, Math.round((avgDur / 300000) * 100)),
                        Math.round(explicit),
                        Math.round(variety),
                        Math.round(newReleases),
                        Math.round(underground),
                    ],
                    backgroundColor: 'rgba(255,77,125,0.15)',
                    borderColor: '#eb5e28',
                    pointBackgroundColor: '#eb5e28',
                    borderWidth: 2,
                }]
            },
            options: {
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: {display: false},
                        grid: {color: 'rgba(255,252,242,0.08)'},
                        pointLabels: {color: '#ccc5b9', font: {size: 10}}
                    }
                },
                plugins: {legend: {display: false}}
            }
        });
    }

    function getMoodEmoji() {
        const avgPop = topTracks.reduce((s, t) => s + t.popularity, 0) / (topTracks.length || 1);
        const explicit = topTracks.filter(t => t.explicit).length / (topTracks.length || 1) * 100;

        if (avgPop > 75 && explicit > 30) return { emoji: '🔥', label: 'Mainstream hit' };
        if (avgPop > 75) return { emoji: '⭐', label: 'Popular taste' };
        if (avgPop < 40) return { emoji: '🎸', label: 'Indie listener' };
        if (explicit > 50) return { emoji: '😤', label: 'Intense' };
        return { emoji: '😌', label: 'Balanced' };
    }
    async function getRecommendations() {
        if (!token) return;

        loadingRecs = true;

        try {
            const [medium, long] = await Promise.all([
                fetchSpotify('/me/top/tracks?limit=50&time_range=medium_term', token),
                fetchSpotify('/me/top/tracks?limit=50&time_range=long_term', token),
            ]);

            const all = [...(medium.items || []), ...(long.items || [])]
                .filter(t => !topTracks.find(tt => tt.id === t.id))
                .filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);

            // Shuffle
            for (let i = all.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [all[i], all[j]] = [all[j], all[i]];
            }

            recommendations = all.slice(0, 10);

        } catch (err) {
            console.error("getRecommendations failed:", err);
        } finally {
            loadingRecs = false;
        }
    }

    function getTotalMinutes() {
        return Math.round(topTracks.reduce((s, t) => s + t.duration_ms, 0) / 60000);
    }

    function formatDuration(ms) {
        return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    }


    async function setTab(tab) {
        activeTab = tab;
        await tick();
        if (tab === 'mood') drawMoodChart();
        if (tab === 'overview') drawPopularityChart();
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

<!--{#if !token}-->
<!--  <div class="login">-->
<!--    <img src="../public/♫ (1).png" alt="Sound Alchemy" class="logo-img"/>-->
<!--    <h1>Sound Alchemy</h1>-->
<!--    <p>Analyze Your Audio Identity</p>-->
<!--    <button class="spotify-btn" on:click={login}>Continue with Spotify</button>-->
<!--  </div>-->
{#if !token}
    <div class="login">
        <div class="sa-logo">
            <svg width="58" height="52" viewBox="0 0 58 52" fill="none">
                <rect x="26" y="4" width="6" height="44" rx="3" fill="#1a1917" opacity="0.9"/>
                <rect x="18" y="12" width="6" height="28" rx="3" fill="#1a1917" opacity="0.85"/>
                <rect x="34" y="12" width="6" height="28" rx="3" fill="#1a1917" opacity="0.85"/>
                <rect x="10" y="18" width="6" height="16" rx="3" fill="#1a1917" opacity="0.75"/>
                <rect x="42" y="18" width="6" height="16" rx="3" fill="#1a1917" opacity="0.75"/>
                <circle cx="7" cy="26" r="3.5" stroke="#1a1917" stroke-width="2" fill="none" opacity="0.75"/>
                <circle cx="51" cy="26" r="3.5" stroke="#1a1917" stroke-width="2" fill="none" opacity="0.75"/>
            </svg>
        </div>
        <h1>Sound Alchemy</h1>
        <p>Analyze Your Audio Identity</p>
        <button class="spotify-btn" on:click={login}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Continue with Spotify
        </button>
        <div class="login-dots">
            <div class="login-dot active"></div>
            <div class="login-dot"></div>
            <div class="login-dot"></div>
        </div>
    </div>

{:else if loading}
    <div class="login">
        <div class="spinner"></div>
        <p>Loading...</p>
    </div>

{:else}
    <div class="app">

        <!-- NAV -->
        <div class="nav">
            <div class="nav-left">
                <div class="nav-logo-svg">
                    <svg width="52" height="48" viewBox="0 0 58 52" fill="none">
                        <rect x="26" y="4" width="6" height="44" rx="3" fill="#eb5e28"/>
                        <rect x="18" y="12" width="6" height="28" rx="3" fill="#eb5e28" opacity="0.85"/>
                        <rect x="34" y="12" width="6" height="28" rx="3" fill="#eb5e28" opacity="0.85"/>
                        <rect x="10" y="18" width="6" height="16" rx="3" fill="#eb5e28" opacity="0.75"/>
                        <rect x="42" y="18" width="6" height="16" rx="3" fill="#eb5e28" opacity="0.75"/>
                        <circle cx="7" cy="26" r="3.5" stroke="#eb5e28" stroke-width="2" fill="none" opacity="0.75"/>
                        <circle cx="51" cy="26" r="3.5" stroke="#eb5e28" stroke-width="2" fill="none" opacity="0.75"/>
                    </svg>
                </div>
                <span class="nav-title">Sound Alchemy</span>
            </div>
            <div class="tabs">
                <button class:active={activeTab === 'overview'} on:click={() => setTab('overview')}>Overview</button>
                <button class:active={activeTab === 'tracks'} on:click={() => setTab('tracks')}>Tracks</button>
                <button class:active={activeTab === 'artists'} on:click={() => setTab('artists')}>Artists</button>
                <button class:active={activeTab === 'mood'} on:click={() => setTab('mood')}>Mood</button>
                <button class:active={activeTab === 'recommended'} on:click={() => setTab('recommended')}>
                    Recommended
                </button>
            </div>
            <div class="nav-right">
                {#if user?.images?.[0]?.url}
                    <img src={user.images[0].url} alt={user.display_name} class="avatar"/>
                {:else}
                    <div class="avatar-placeholder">👤</div>
                {/if}
                <span class="username">{user?.display_name}</span>
                <button class="logout-btn" on:click={logout}>Logout</button>
            </div>
        </div>

        <!-- STATS -->
        <div class="stats-row">
            <div class="stat-card">
                <span class="stat-num">{topTracks.length}</span>
                <span class="stat-label">Top songs</span>
            </div>
            <div class="stat-card">
                <span class="stat-num">{topArtists.length}</span>
                <span class="stat-label">Top artists</span>
            </div>
            <div class="stat-card">
                <span class="stat-num">{getTotalMinutes()}</span>
                <span class="stat-label">Minutes</span>
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
                        <h3>Top albums</h3>
                    </div>
                    <div class="albums-row">
                        {#each topTracks.slice(0, 6) as track, i}
                            <div class="album-card" class:active-album={currentTrack?.id === track.id}
                                 on:click={() => playTrack(track)}>
                                <div class="album-thumb">
                                    {#if track.album.images?.[0]?.url}
                                        <img src={track.album.images[0].url} alt={track.album.name}/>
                                    {:else}
                                        <div class="album-thumb-placeholder"
                                             style="background:{gradients[i % gradients.length]}">🎵
                                        </div>
                                    {/if}
                                    <div class="play-overlay">
                                        <div class="play-btn-circle">▶</div>
                                    </div>
                                </div>
                                <div class="album-name">{track.album.name.length > 14 ? track.album.name.slice(0, 14) + '...' : track.album.name}</div>
                                <div class="album-artist">{track.artists[0].name}</div>
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- Chart -->
                <div class="section">
                    <div class="section-header"><h3>Top Tracks Popularity</h3></div>
                    <div class="chart-box">
                        <canvas bind:this={popularityChartEl}></canvas>
                    </div>
                </div>

            {:else if activeTab === 'tracks'}
                <div class="section">
                    <div class="section-header"><h3>Your Top Tracks</h3></div>
                    <div class="track-list">
                        {#each topTracks as track, i}
                            <div class="track-item" class:playing={currentTrack?.id === track.id}
                                 on:click={() => playTrack(track)}>
                                <span class="rank">#{i + 1}</span>
                                <div class="track-thumb">
                                    {#if track.album.images?.[2]?.url}
                                        <img src={track.album.images[2].url} alt={track.name}/>
                                    {:else}
                                        <div class="thumb-placeholder"
                                             style="background:{gradients[i % gradients.length]}">🎵
                                        </div>
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
                    <div class="section-header"><h3>Your Top Artists</h3></div>
                    <div class="artists-grid">
                        {#each topArtists as artist, i}
                            <div class="artist-card">
                                {#if artist.images?.[0]?.url}
                                    <img src={artist.images[0].url} alt={artist.name}/>
                                {:else}
                                    <div class="artist-placeholder"
                                         style="background:{gradients[i % gradients.length]}">🎤
                                    </div>
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
                    <div class="section-header"><h3>Your Music Profile</h3></div>
                    <div class="mood-top">
                        <span class="big-emoji">{getMoodEmoji().emoji}</span>
                        <span class="mood-label">{getMoodEmoji().label}</span>
                    </div>
                    <div class="chart-box">
                        <canvas bind:this={moodChartEl}></canvas>
                    </div>
                    <div class="mood-bars">
                        {#each [
                            ['Average popularity', Math.round(topTracks.reduce((s, t) => s + t.popularity, 0) / (topTracks.length || 1))],
                            ['Explicit content', Math.round(topTracks.filter(t => t.explicit).length / (topTracks.length || 1) * 100)],
                            ['New releases (2023+)', Math.round(topTracks.filter(t => new Date(t.album.release_date).getFullYear() >= 2023).length / (topTracks.length || 1) * 100)],
                            ['Independent artists', Math.round(topArtists.filter(a => a.popularity < 60).length / (topArtists.length || 1) * 100)],
                        ] as [label, val]}
                            <div class="mood-bar-row">
                                <span>{label}</span>
                                <div class="bar-bg">
                                    <div class="bar-fill" style="width:{val}%"></div>
                                </div>
                                <span class="pct">{val}%</span>
                            </div>
                        {/each}
                    </div>
                </div>
            {:else if activeTab === 'recommended'}
                <div class="section">
                    <div class="section-header"
                         style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>Recommended for you</h3>
                        <button class="logout-btn" on:click={getRecommendations}>Refresh</button>
                    </div>

                    {#if loadingRecs}
                        <div class="spinner"></div>
                    {:else}
                        <div class="track-list">
                            {#each recommendations as track, i}
                                <div class="track-item" on:click={() => playTrack(track)}>

                                    <div class="track-thumb">
                                        {#if track.album?.images?.[2]?.url}
                                            <img src={track.album.images[2].url}/>
                                        {:else}
                                            <div class="thumb-placeholder"
                                                 style="background:{gradients[i % gradients.length]}">🎵
                                            </div>
                                        {/if}
                                    </div>

                                    <div class="track-info">
                                        <div class="track-name">{track.name}</div>
                                        <div class="track-artist">{track.artists[0].name}</div>
                                    </div>

                                    <span class="pop-badge">{track.popularity}</span>
                                </div>
                            {/each}
                        </div>
                    {/if}

                </div>
            {/if}
        </div>


        <!-- PLAYER BAR -->
        {#if currentTrack}
            <div class="player-bar">
                <div class="player-track">
                    {#if currentTrack.album.images?.[2]?.url}
                        <img src={currentTrack.album.images[2].url} alt={currentTrack.name} class="player-thumb"/>
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
                        <button class="ctrl-btn" on:click={prevTrack}>⏮</button>
                        <button class="play-main" on:click={togglePlay}>{isPlaying ? '⏸' : '▶'}</button>
                        <button class="ctrl-btn" on:click={nextTrack}>⏭</button>
                    </div>
                    <div class="progress-wrap">
                        <span class="time">{formatDuration(currentPosition)}</span>
                        <div class="progress-track">
                            <div class="progress-fill" style="width:{progressWidth}%"></div>
                        </div>
                        <span class="time">{formatDuration(currentTrack.duration_ms)}</span>
                    </div>
                </div>
                <div class="player-right">
                    <span>🔊</span>
                    <div class="vol-track" on:click={setVolume}>
                        <div class="vol-fill" style="width:{volume * 100}%"></div>
                    </div>
                </div>
            </div>
        {/if}

    </div>
{/if}

<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    :global(body) {
        /*background: #252422;*/
        background: #1a1917;
        color: white;
        font-family: 'Inter', sans-serif;
        min-height: 100vh;
        margin: 0;
    }

    .login {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        gap: 0;
        background: #1a1917;
        color: white;

    }

    .sa-logo {
        width: 110px;
        height: 110px;
        background: linear-gradient(145deg, #f07843, #eb5e28);
        border-radius: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 28px;
        box-shadow: 0 0 0 1px rgba(235, 94, 40, 0.3), 0 20px 60px rgba(235, 94, 40, 0.25);
        position: relative;
        overflow: hidden;
    }

    .nav-logo-svg {
        display: flex;
        align-items: center;
    }

    .sa-logo::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, transparent 60%);
        border-radius: 28px;
    }

    .login h1 {
        font-size: 30px;
        font-weight: 700;
        color: #fffcf2;
        letter-spacing: -0.5px;
        margin-bottom: 8px;
        line-height: 1.1;
    }

    .login p {
        font-size: 14px;
        color: #8c8984;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        font-weight: 400;
        margin-bottom: 36px;
    }

    .spotify-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        background: #1DB954;
        color: #fff;
        border: none;
        padding: 14px 32px;
        border-radius: 50px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        font-family: 'Inter', sans-serif;
        letter-spacing: 0.1px;
        transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
        box-shadow: 0 4px 24px rgba(29, 185, 84, 0.35);
    }

    .spotify-btn:hover {
        background: #1ed760;
        transform: translateY(-1px);
        box-shadow: 0 8px 32px rgba(29, 185, 84, 0.45);
    }

    .spotify-btn:active {
        transform: scale(0.97);
    }

    .login-dots {
        display: flex;
        gap: 6px;
        margin-top: 40px;
    }

    .login-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #3a3835;
    }

    .login-dot.active {
        background: #eb5e28;
    }

    .logo-img {
        width: 200px;
        height: auto;
        border-radius: 20px;
        object-fit: contain;
        filter: drop-shadow(0 4px 20px rgba(235, 94, 40, 0.3));
    }

    .logo {
        font-size: 4rem;
    }

    .login h1 {
        font-family: 'Inter', sans-serif;
        font-size: 2.2rem;
    }

    .login p {
        color: #ccc5b9;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #222;
        border-top-color: #eb5e28;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .spotify-btn {
        background: #1DB954;
        color: white;
        border: none;
        padding: 14px 36px;
        border-radius: 50px;
        font-size: 16px;
        font-family: 'Inter', sans-serif;
        cursor: pointer;
        font-weight: 500;

    }

    .spotify-btn:hover {
        background: #1aa34a;
    }

    .app {
        max-width: 100%;
        margin: 0;
        padding: 0 32px 100px;
        min-height: 100vh;
    }

    /* NAV */
    .nav {
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 32px;
        margin-bottom: 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        position: sticky;
        top: 0;
        background: rgba(26, 25, 23, 0.97);
        backdrop-filter: blur(20px);
        z-index: 100;
        margin-left: -32px;
        margin-right: -32px;
    }

    .nav-left {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .nav-logo {
        font-size: 1.4rem;
    }

    .nav-title {
        font-family: 'Inter', sans-serif;
        font-weight: 700;
        font-size: 1.5rem;
    }

    .nav-right {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        object-fit: cover;
    }

    .avatar-placeholder {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #eb5e28;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .username {
        font-size: 13px;
        color: #ccc5b9;
    }

    .logout-btn {
        background: transparent;
        color: #ccc5b9;
        border: 1px solid #333;
        padding: 6px 14px;
        border-radius: 50px;
        cursor: pointer;
        font-size: 12px;
        font-family: 'Inter', sans-serif;
    }

    .logout-btn:hover {
        color: white;
        border-color: #ccc5b9;
    }

    /* TABS */
    .tabs {
        display: flex;
        gap: 6px;
    }

    .tabs button {
        background: rgba(255, 252, 242, 0.08);
        color: #ccc5b9;
        border: none;
        padding: 8px 16px;
        border-radius: 50px;
        cursor: pointer;
        font-size: 13px;
        font-family: 'Inter', sans-serif;
        transition: all 0.2s;
    }

    .tabs button.active {
        background: #eb5e28;
        color: white;
    }

    .tabs button:hover:not(.active) {
        color: white;
        background: rgba(255, 252, 242, 0.1);
    }

    /* STATS */
    .stats-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 40px;
        margin-bottom: 24px;
    }

    .stat-card {
        background: #403d39;
        border-radius: 14px;
        padding: 16px;

        text-align: center;
        border: 1px solid rgba(255, 252, 242, 0.08);
    }

    .stat-num {
        display: block;
        font-size: 1.8rem;
        font-weight: 700;
        color: #eb5e28;
        font-family: 'Inter', sans-serif;
    }

    .stat-label {
        font-size: 0.75rem;
        color: #ccc5b9;
        margin-top: 4px;
        display: block;
    }

    .content {
        display: flex;
        flex-direction: column;
        gap: 28px;
    }

    .section-header {
        margin-bottom: 20px;
        margin-top: 20px
    }

    .section-header h3 {
        font-family: 'Inter', sans-serif;
        font-size: 1.5rem;
        font-weight: 700;
        padding: 10px
    }

    /* ALBUMS */
    .albums-row {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 12px;
    }

    .album-card {
        cursor: pointer;
        transition: transform 0.2s;
    }

    .album-card:hover {
        transform: translateY(-4px);
    }

    .album-card:hover .play-overlay {
        opacity: 1;
    }

    .album-thumb {
        position: relative;
        border-radius: 12px;
        overflow: hidden;
        aspect-ratio: 1;
        margin-bottom: 8px;
    }

    .album-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .album-thumb-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
    }

    .play-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s;
    }

    .play-btn-circle {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #eb5e28;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        box-shadow: 0 4px 20px rgba(235, 94, 40, 0.4);
    }

    .active-album .album-thumb {
        box-shadow: 0 0 0 2px #eb5e28;
    }

    .active-album .album-name {
        color: #eb5e28;
    }

    .album-name {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .album-artist {
        font-size: 11px;
        color: #ccc5b9;
    }

    /* CHART */

    .chart-box {
        display: flex;
        justify-content: center;
        height: 600px;
        background: #403d39;
        border-radius: 14px;
        padding: 30px;
        border: 1px solid rgba(255, 252, 242, 0.08);

    }
    .chart-box canvas {
        max-height: 500px;
        align-content: center;
    }

    /* TRACKS */
    .track-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .track-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        transition: background 0.15s;
    }

    .track-item:hover {
        background: rgba(255, 252, 242, 0.08);
    }

    .track-item.playing {
        background: linear-gradient(90deg, rgba(255, 77, 125, 0.12), transparent);
        border: 1px solid rgba(255, 77, 125, 0.2);
    }

    .rank {
        color: #eb5e28;
        font-weight: 700;
        width: 28px;
        font-size: 13px;
        font-family: 'Inter', sans-serif;
    }

    .track-thumb {
        width: 46px;
        height: 46px;
        border-radius: 8px;
        overflow: hidden;
        flex-shrink: 0;
    }

    .track-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .thumb-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
    }

    .track-info {
        flex: 1;
        min-width: 0;
    }

    .track-name {
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .track-artist {
        font-size: 12px;
        color: #ccc5b9;
    }

    .track-item.playing .track-name {
        color: #eb5e28;
    }

    .duration {
        font-size: 12px;
        color: #ccc5b9;
    }

    .pop-badge {
        background: rgba(255, 77, 125, 0.15);
        color: #eb5e28;
        font-size: 11px;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 50px;
    }

    /* PLAYING INDICATOR */
    .playing-indicator {
        display: flex;
        gap: 2px;
        align-items: flex-end;
        height: 16px;
    }

    .playing-indicator span {
        display: block;
        width: 3px;
        background: #eb5e28;
        border-radius: 2px;
        animation: bounce 0.8s ease infinite;
    }

    .playing-indicator span:nth-child(2) {
        animation-delay: 0.15s;
    }

    .playing-indicator span:nth-child(3) {
        animation-delay: 0.3s;
    }

    @keyframes bounce {
        0%, 100% {
            height: 4px
        }
        50% {
            height: 14px
        }
    }

    /* ARTISTS */
    .artists-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px;
    }

    .artist-card {
        background: #403d39;
        border-radius: 14px;
        padding: 14px;
        text-align: center;
        border: 1px solid rgba(255, 252, 242, 0.08);
        transition: transform 0.2s;
    }

    .artist-card:hover {
        transform: translateY(-3px);
    }

    .artist-card img {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: 50%;
        margin-bottom: 10px;
    }

    .artist-placeholder {
        width: 100%;
        aspect-ratio: 1;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        margin-bottom: 10px;
    }

    .artist-name {
        display: block;
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 4px;
    }

    .artist-rank {
        display: block;
        font-size: 20px;
        color: #eb5e28;
    }

    .genre {
        display: block;
        font-size: 10px;
        color: #ccc5b9;
        margin-top: 3px;
    }

    /* MOOD */
    .mood-top {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
    }

    .big-emoji {
        font-size: 3rem;
    }

    .mood-label {
        font-family: 'Inter', sans-serif;
        font-size: 1.2rem;
        color: #eb5e28;
        font-weight: 700;
        margin-top: 15px;
    }

    .mood-bars {
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin-top: 16px;
    }

    .mood-bar-row {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .mood-bar-row span:first-child {
        width: 180px;
        font-size: 12px;
        color: #ccc5b9;
        flex-shrink: 0;
    }

    .bar-bg {
        flex: 1;
        background: rgba(255, 255, 255, 0.07);
        border-radius: 50px;
        height: 6px;
    }

    .bar-fill {
        background: #eb5e28;
        height: 6px;
        border-radius: 50px;
        transition: width 0.6s ease;
    }

    .pct {
        width: 36px;
        font-size: 12px;
        color: #ccc5b9;
        text-align: right;
    }

    /* PLAYER */
    .player-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(37, 36, 34, 0.97);
        backdrop-filter: blur(30px);
        border-top: 1px solid rgba(255, 255, 255, 0.07);
        padding: 12px 28px;
        display: flex;
        align-items: center;
        gap: 20px;
        z-index: 200;
    }

    .player-track {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 240px;
    }

    .player-thumb {
        width: 44px;
        height: 44px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
    }

    .player-thumb-placeholder {
        width: 44px;
        height: 44px;
        border-radius: 8px;
        background: #eb5e28;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        flex-shrink: 0;
    }

    .player-info {
        min-width: 0;
    }

    .player-name {
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .player-artist {
        font-size: 11px;
        color: #ccc5b9;
    }

    .player-controls {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }

    .ctrl-btns {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .ctrl-btn {
        background: none;
        border: none;
        color: #ccc5b9;
        font-size: 18px;
        cursor: pointer;
        transition: color 0.15s;
    }

    .ctrl-btn:hover {
        color: white;
    }

    .play-main {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: white;
        border: none;
        cursor: pointer;
        font-size: 14px;
        color: black;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.15s;
    }

    .play-main:hover {
        transform: scale(1.08);
    }

    .progress-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        max-width: 380px;
    }

    .time {
        font-size: 11px;
        color: #ccc5b9;
    }

    .progress-track {
        flex: 1;
        height: 3px;
        background: rgba(255, 252, 242, 0.15);
        border-radius: 3px;
    }

    .progress-fill {
        height: 100%;
        background: white;
        border-radius: 3px;
    }

    .player-right {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 160px;
        justify-content: flex-end;
        color: #ccc5b9;
        font-size: 16px;
    }

    .vol-track {
        width: 100px;
        height: 8px;
        background: rgba(255, 252, 242, 0.15);
        border-radius: 3px;
        cursor: pointer;
    }

    .vol-fill {
        height: 100%;
        width: 70%;
        background: white;
        border-radius: 3px;
    }
</style>