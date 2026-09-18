/**
 * scripts/update-meta-profile.js — Update Meta WhatsApp Business Profile and Logo.
 *
 * Updates:
 *   - About & Bio: "Indal KP | Creative Technologist & Film Maker"
 *   - Description: Bilingual production details & services
 *   - Address: "Online / Global Studio"
 *   - Email: "indalkp@gmail.com"
 *   - Websites: ["https://indalkp.com"]
 *   - Vertical: "ENTERTAINMENT"
 *   - Profile Picture: Uploads assets/kp-logo.png via Meta Resumable Upload API
 *
 * Usage:
 *   node scripts/update-meta-profile.js
 *   node scripts/update-meta-profile.js --pnid <PHONE_NUMBER_ID> --token <META_ACCESS_TOKEN>
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Try loading .env or .env.yaml if present
function loadEnvFiles() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }

  const yamlPath = path.join(__dirname, '..', '.env.yaml');
  if (fs.existsSync(yamlPath)) {
    const lines = fs.readFileSync(yamlPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf(':');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

loadEnvFiles();

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return null;
}

const META_ACCESS_TOKEN = getArg('--token') || process.env.META_ACCESS_TOKEN;
const META_PHONE_NUMBER_ID = getArg('--pnid') || process.env.META_PHONE_NUMBER_ID;
const GRAPH_API_VERSION = getArg('--version') || process.env.GRAPH_API_VERSION || 'v18.0';

if (!META_ACCESS_TOKEN) {
  console.error('❌ Missing META_ACCESS_TOKEN.');
  console.error('Provide via .env, .env.yaml, or CLI: node scripts/update-meta-profile.js --token <TOKEN> --pnid <PNID>');
  process.exit(1);
}

if (!META_PHONE_NUMBER_ID) {
  console.error('❌ Missing META_PHONE_NUMBER_ID.');
  console.error('Provide via .env, .env.yaml, or CLI: node scripts/update-meta-profile.js --pnid <PNID>');
  process.exit(1);
}

const PROFILE_DATA = {
  messaging_product: 'whatsapp',
  about: 'Indal KP | Creative Technologist & Film Maker',
  address: 'Online / Global Studio',
  description:
    'Crafting hybrid 2D hand-drawn animation, cinematic AI commercials, and custom preproduction pipelines. From conceptual script and storyboard to living characters and turnkey video assets.\n\n' +
    'कला और तकनीक का अद्वितीय संगम — चलचित्र निर्माण एवं रचनात्मक स्वचालन।',
  email: 'indalkp@gmail.com',
  websites: ['https://indalkp.com'],
  vertical: 'ENTERTAINMENT',
};

async function uploadProfilePicture(pnid, token, version) {
  const logoCandidates = [
    path.join(__dirname, '..', 'assets', 'kp-logo.png'),
    'E:\\Projects\\ai-knowledge\\Studio\\brand\\KP Logo.png',
  ];

  let logoPath = null;
  for (const candidate of logoCandidates) {
    if (fs.existsSync(candidate)) {
      logoPath = candidate;
      break;
    }
  }

  if (!logoPath) {
    console.warn('⚠️ No logo file found in assets/kp-logo.png. Skipping profile picture upload.');
    return null;
  }

  const fileStats = fs.statSync(logoPath);
  const fileBuffer = fs.readFileSync(logoPath);
  console.log(`📷 Found logo at: ${logoPath} (${fileStats.size} bytes)`);

  // Step 1: Create Resumable Upload Session
  const initUrl = `https://graph.facebook.com/${version}/app/uploads?file_length=${fileStats.size}&file_type=image/png&access_token=${token}`;
  try {
    const initRes = await fetch(initUrl, { method: 'POST' });
    const initJson = await initRes.json();
    if (!initRes.ok || !initJson.id) {
      console.warn('⚠️ Could not initiate Meta upload session:', initJson.error?.message || initJson);
      return null;
    }

    const uploadSessionId = initJson.id;
    console.log(`📤 Upload session initiated: ${uploadSessionId}`);

    // Step 2: Transfer binary
    const uploadUrl = `https://graph.facebook.com/${version}/${uploadSessionId}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: '0',
      },
      body: fileBuffer,
    });
    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok || !uploadJson.h) {
      console.warn('⚠️ Binary upload failed:', uploadJson.error?.message || uploadJson);
      return null;
    }

    const pictureHandle = uploadJson.h;
    console.log(`✅ Uploaded successfully. Profile picture handle: ${pictureHandle}`);
    return pictureHandle;
  } catch (err) {
    console.warn('⚠️ Error during profile picture upload process:', err.message);
    return null;
  }
}

async function updateProfile() {
  console.log(`=======================================================`);
  console.log(`🚀 Updating WhatsApp Business Profile for Indal KP Studio`);
  console.log(`Target PNID : ${META_PHONE_NUMBER_ID}`);
  console.log(`Graph API   : ${GRAPH_API_VERSION}`);
  console.log(`=======================================================`);

  // Try uploading picture first
  const photoHandle = await uploadProfilePicture(META_PHONE_NUMBER_ID, META_ACCESS_TOKEN, GRAPH_API_VERSION);

  const payload = { ...PROFILE_DATA };
  if (photoHandle) {
    payload.profile_picture_handle = photoHandle;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${META_PHONE_NUMBER_ID}/whatsapp_business_profile`;
  console.log(`📡 Sending profile payload to Meta Cloud API...`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      console.error('❌ Profile update failed:', JSON.stringify(json, null, 2));
      process.exit(1);
    }

    console.log('✅ WhatsApp Business Profile successfully updated:');
    console.log(JSON.stringify(json, null, 2));

    // Verify by reading back
    console.log('\n🔍 Verifying updated profile from Meta API...');
    const verifyUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${META_PHONE_NUMBER_ID}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`;
    const verifyRes = await fetch(verifyUrl, {
      headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
    });
    const verifyJson = await verifyRes.json();
    console.log(JSON.stringify(verifyJson, null, 2));
  } catch (err) {
    console.error('❌ Network / execution error:', err.message);
    process.exit(1);
  }
}

updateProfile();
