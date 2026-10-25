# Paycheck & Bills: setup

This is your own copy of the app. It does not need Claude. You set up two free things:

- **Firebase** keeps your data and handles sign-in, so every device shows the same numbers.
- **GitHub Pages** puts the app on the web at an address you can open on any device.

Plan on about 20 minutes. You only do this once. No credit card is needed for either.

## Part 1: Firebase (your data and sign-in)

1. Go to https://console.firebase.google.com and sign in with a Google account. Choose **Create a project**, name it (for example `my-budget`), and turn **off** Google Analytics. Choose **Create project**.
2. In the left menu open **Build**, then **Authentication**. Choose **Get started**, open the **Sign-in method** tab, choose **Email/Password**, switch on the first toggle (Email/Password), and **Save**.
3. In the left menu open **Build**, then **Firestore Database**. Choose **Create database**. Pick any United States location (this cannot be changed later). Choose **Start in production mode**, then **Create**.
4. Still in Firestore Database, open the **Rules** tab. Delete everything in the box, paste the contents of the file `firestore.rules` from this folder, and choose **Publish**. These rules let each signed-in person see only their own data.
5. Click the gear icon next to **Project Overview**, then **Project settings**. On the **General** tab scroll to **Your apps** and choose the web icon `</>`. Give it any nickname, leave Firebase Hosting unchecked, and choose **Register app**. Firebase shows a block of code with a `firebaseConfig` section.
6. Open `site/config.js` in any text editor (Notepad works). Replace each `PASTE_...` value with the matching value from `firebaseConfig`: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. Keep the quotation marks and commas. Save the file.

## Part 2: GitHub Pages (the web address)

1. Go to https://github.com and create a free account.
2. Choose **New repository**. Name it (for example `budget`), set it to **Public**, and choose **Create repository**. GitHub Pages is free only for public repositories. Your budget numbers are not stored here, only the app's files.
3. On the new repository page choose **uploading an existing file**. Open the `site` folder on your computer, select **everything inside it** (not the folder itself, and include `.nojekyll` if your computer shows hidden files), and drag it into the browser. Choose **Commit changes**. `index.html` must sit at the top level of the repository.
4. In the repository choose **Settings**, then **Pages**. Under **Build and deployment** set **Source** to **Deploy from a branch**, set **Branch** to `main` and the folder to `/ (root)`, and choose **Save**.
5. Wait a few minutes. The address appears at the top of the Pages screen. It looks like `https://YOURNAME.github.io/budget/`.
6. Back in Firebase open **Authentication**, then **Settings**, then **Authorized domains**, and add `YOURNAME.github.io`.

## Part 3: Use it

1. Open your address on your computer. Enter your email and a password (at least 6 characters) and choose **Create account**.
2. Enter your paycheck and how often you are paid, then add your bills.
3. On each phone or iPad open the same address, choose **Sign in**, and use the same email and password. Everything you entered is already there.
4. To get the app icon:
   - **iPhone and iPad:** open the address in Safari, tap the Share button, then **Add to Home Screen**.
   - **Android:** in Chrome open the menu, then **Install app** or **Add to Home screen**.
   - **Computer:** in Chrome or Edge use the install icon at the right of the address bar.

## Good to know

- **Offline:** after your first visit the app opens with no connection. Changes you make offline are saved on the device and sync when you reconnect.
- **Privacy:** anyone can see the app's files in your public repository, including your Firebase settings. Those settings are not passwords. Your data is protected by your sign-in and the rules from step 4. You can also stop strangers from making accounts: in Firebase open **Authentication**, **Settings**, **User actions**, and turn off sign-up once you and your family have accounts, if you see that option.
- **Cost:** the free Firebase plan allows far more reads and writes per day than a personal budget uses. If a limit were ever hit, Firebase pauses that feature for the rest of the month and does not charge you unless you add a payment method.
- **Changing the app:** to change a file, open it in your repository, choose the pencil icon, edit, and commit. Your devices pick up the change the next time you open the app online.
- **Forgot password:** use the **Forgot password?** link on the sign-in screen.
- **Salary versus commission:** your salary is saved once and used for the fixed monthly income. Add each pay period's commission with its pay date. "Left after bills" uses salary only. "Left with commissions" adds the commissions logged for the current month.
