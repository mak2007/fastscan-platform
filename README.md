# FastScan UPI - Boss, Publisher & Worker Pyramid Marketplace

A high-speed real-time platform connecting **Publishers (Agents)** who submit UPI links for scanning with **Workers & Sub-worker Pyramids** who race to claim and complete tasks with instant publisher verification, automated strike timeouts, and dual-rail payouts (UPI & Binance).

---

## 🌟 Key Features Built

### 1. Publisher / Agent Panel (Web Dashboard)
- **UPI Link Validation**: Confirms and enforces that every submitted link has `"upi"` (case-insensitive substring, e.g. `upi://pay?...`, Google Pay / Paytm / PhonePe UPI links). Non-UPI links are automatically rejected.
- **Configurable Expiry Countdown**: Default 5 minutes (300s), with 1-click presets (2m, 3m, 5m, 10m, 15m).
- **Today's 24-Hour Metrics**: Live counter of successful orders completed in the last 24 hours.
- **Live Worker Presence**: Real-time counter showing online workers ready to scan.
- **Special Promo Pricing Offer**:
  - Unlocks special offer for first 3 links at **$0.55** per link.
  - After 3 links, rate switches to standard **$0.60** (both rates are Boss-configurable).
- **Publication Lock (Paywall)**:
  - If publisher completes 3 successful scans (configurable to 5 or any custom limit), publishing is paused with message: *"Please pay for current orders"*.
  - Displays Boss UPI & Binance payment details.
  - Publisher requests payment confirmation; Boss reviews and unlocks the publisher.
- **Awaiting Confirmation Queue**:
  - Live review card when worker finishes task.
  - 1-click **Confirm Success** or **Trial Not Activated / Reject**.
- **Recent Orders Explorer**:
  - 3 dedicated tabs:
    1. **Success**
    2. **Expired**
    3. **Trial Not Activated**

### 2. Worker Panel (Mobile-First Interface)
- **Fastest-Finger Order Marketplace**:
  - Real-time pool of published orders.
  - Audio and visual alerts on arrival.
  - First worker to click **"CLAIM NOW"** gets the order with atomic race condition prevention.
- **Auto-Redirect & "My Tasks"**:
  - Claiming immediately redirects to the worker's active tasks.
  - 1-Click **"Copy Link"** button to copy and send to the next person.
  - Dual action buttons: **Mark as Success** or **Report Failed**.
  - Moves to *"Awaiting for confirmation"* while publisher verifies.
- **Live Publisher Count**: Real-time counter showing active publishers online.
- **Sub-worker Pyramid Hierarchy**:
  - Generate unique invite keys (`SUB-NAME-XXXX`) for sub-workers.
  - Sub-workers join under their referrer (Level 1 &rarr; Level 2 &rarr; Level 3).
  - Every order completed by a sub-worker rolls into the Level 1 Boss Worker's *"Overall Completed by Team"* count.
  - **Payout Restriction**: Payout requests are strictly reserved for **Level 1 Workers**. Level 2/3 workers see *"Managed by Parent Worker"*.
- **Progressive Strike & Penalty System**:
  - **2 consecutive failures** &rarr; **2 minutes timeout** (Claim button disabled, countdown ticker shown).
  - **4 consecutive failures** &rarr; **30 minutes timeout**.
  - **6 consecutive failures** &rarr; **Permanent Account Ban** (can be unbanned by Boss).
  - Any successful completion immediately resets strikes to 0!
- **Dual-Rail Payout System**:
  - **UPI Payout**: Submit UPI ID, Beneficiary Name, and UPI QR Code image upload.
  - **Binance Payout**: Submit Binance ID / Pay ID and Account Name.
  - Real-time payout request history tracking (Pending, Approved, Rejected).

### 3. Super Boss / Admin Command Center
- **Global Link & Order Audit**: Inspect all submitted links, filters, search by ID or URL.
- **Publisher Unlocking**: 1-click verify and unlock publishers when dues are cleared.
- **Payout Approvals**: Inspect UPI QR codes or Binance Pay IDs and release payouts.
- **Strike & Penalty Overrides**: View worker strikes, timeouts, and unban workers.
- **Platform Configuration**: Change scan lock limit (e.g. from 3 to 5), promo rates, standard rates, default timers, and Boss payment addresses.

---

## 🚀 How to Run

### Unified Run (Backend + Built Frontend)
From the project root:
```bash
cd C:\Users\aditya\.gemini\antigravity\scratch\boss-worker-platform
node server/index.js
```
Open your browser at: **`http://localhost:5000`**

### Development Mode (Vite HMR)
In terminal 1:
```bash
cd server
npm start
```
In terminal 2:
```bash
cd client
npm run dev
```
Open **`http://localhost:5173`**

---

## 🧪 Testing Role Switching
Use the top sticky bar in the web app to switch instantly between:
1. **Agent / Publisher**: Web panel for submitting UPI links.
2. **Main Worker (L1 Boss)**: Mobile panel with full claim, team tree, and payouts.
3. **Sub-worker (L2)**: Mobile panel earning credits for L1.
4. **Super Boss (Admin)**: Administrative control room.
