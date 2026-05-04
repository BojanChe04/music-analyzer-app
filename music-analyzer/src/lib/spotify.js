const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
const SCOPES = import.meta.env.VITE_SCOPES;

async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function login() {
    const verifier = crypto.randomUUID() + crypto.randomUUID();
    const challenge = await generateCodeChallenge(verifier);
    localStorage.setItem('pkce_verifier', verifier);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: challenge,
    });
    window.location = `https://accounts.spotify.com/authorize?${params}`;
}

export async function getToken(code) {
    const verifier = localStorage.getItem('pkce_verifier');
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
        }),
    });
    return res.json();
}

// export async function fetchSpotify(endpoint, token) {
//     const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
//         headers: { Authorization: `Bearer ${token}` },
//     });
//     return res.json();
// }
export async function fetchSpotify(endpoint, token) {
    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
        localStorage.removeItem('spotify_token');
        window.location.href = '/';
        return {};
    }

    return res.json();
}
// ─── Web Playback SDK ─────────────────────────────────────────────

export function initPlayer(token, onStateChange) {
    return new Promise((resolve) => {
        if (window.Spotify) {
            setupPlayer(token, onStateChange, resolve);
            return;
        }

        window.onSpotifyWebPlaybackSDKReady = () => {
            setupPlayer(token, onStateChange, resolve);
        };

        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.head.appendChild(script);
    });
}

function setupPlayer(token, onStateChange, resolve) {
    const player = new window.Spotify.Player({
        name: 'Sound Alchemy',
        getOAuthToken: cb => cb(token),
        volume: 0.5,
    });

    player.addListener('ready', ({ device_id }) => {
        console.log('Player ready:', device_id);
        resolve({ player, device_id });
    });

    player.addListener('not_ready', ({ device_id }) => {
        console.warn('Device offline:', device_id);
    });

    player.addListener('player_state_changed', onStateChange);

    player.addListener('initialization_error', ({ message }) => {
        console.error('Init error:', message);
    });

    player.addListener('authentication_error', ({ message }) => {
        console.error('Auth error:', message);
    });

    player.addListener('account_error', ({ message }) => {
        console.error('Premium потребен:', message);
    });

    player.connect();
}

export async function playTrackOnDevice(token, trackUri, deviceId) {
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [trackUri] }),
    });
}







// const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
// const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
// const SCOPES = import.meta.env.VITE_SCOPES;
//
// async function generateCodeChallenge(verifier) {
//     const data = new TextEncoder().encode(verifier);
//     const digest = await crypto.subtle.digest('SHA-256', data);
//     return btoa(String.fromCharCode(...new Uint8Array(digest)))
//         .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
// }
//
// export async function login() {
//     const verifier = crypto.randomUUID() + crypto.randomUUID();
//     const challenge = await generateCodeChallenge(verifier);
//     localStorage.setItem('pkce_verifier', verifier);
//
//     const params = new URLSearchParams({
//         response_type: 'code',
//         client_id: CLIENT_ID,
//         scope: SCOPES,
//         redirect_uri: REDIRECT_URI,
//         code_challenge_method: 'S256',
//         code_challenge: challenge,
//     });
//     window.location = `https://accounts.spotify.com/authorize?${params}`;
// }
//
// export async function getToken(code) {
//     const verifier = localStorage.getItem('pkce_verifier');
//     const res = await fetch('https://accounts.spotify.com/api/token', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
//         body: new URLSearchParams({
//             client_id: CLIENT_ID,
//             grant_type: 'authorization_code',
//             code,
//             redirect_uri: REDIRECT_URI,
//             code_verifier: verifier,
//         }),
//     });
//     return res.json();
// }
//
// export async function fetchSpotify(endpoint, token) {
//     const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
//         headers: { Authorization: `Bearer ${token}` },
//     });
//     return res.json();
// }
//
// export function initPlayer(token, onStateChange) {
//     return new Promise((resolve) => {
//         if (window.Spotify) {
//             setupPlayer(token, onStateChange, resolve);
//             return;
//         }
//         window.onSpotifyWebPlaybackSDKReady = () => {
//             setupPlayer(token, onStateChange, resolve);
//         };
//         const script = document.createElement('script');
//         script.src = 'https://sdk.scdn.co/spotify-player.js';
//         script.async = true;
//         document.head.appendChild(script);
//     });
// }
//
// function setupPlayer(token, onStateChange, resolve) {
//     const player = new window.Spotify.Player({
//         name: 'Sound Alchemy',
//         getOAuthToken: cb => cb(token),
//         volume: 0.5,
//     });
//     player.addListener('ready', ({ device_id }) => resolve({ player, device_id }));
//     player.addListener('not_ready', ({ device_id }) => console.warn('Device offline:', device_id));
//     player.addListener('player_state_changed', onStateChange);
//     player.addListener('initialization_error', ({ message }) => console.error('Init error:', message));
//     player.addListener('authentication_error', ({ message }) => console.error('Auth error:', message));
//     player.addListener('account_error', ({ message }) => console.error('Premium потребен:', message));
//     player.connect();
// }
//
// export async function playTrackOnDevice(token, trackUri, deviceId) {
//     await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
//         method: 'PUT',
//         headers: {
//             Authorization: `Bearer ${token}`,
//             'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({ uris: [trackUri] }),
//     });
// }