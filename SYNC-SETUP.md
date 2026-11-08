# Setting up syncing

This takes about 10 minutes on a computer. You'll create a free Firebase project and one shared login for you and Wes. No credit card is needed on the free Spark plan.

## 1. Create the project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with your Google account.
2. Choose **Create a project** and name it `salad-tower`.
3. You can turn Google Analytics and any AI assistant options off, since the app doesn't use them.

## 2. Make your shared login

1. In the left menu, open **Security** or **Build**, then **Authentication**, and choose **Get started**.
2. Under **Sign-in method**, turn on **Email/Password**. Leave "passwordless" off.
3. Under **Users**, choose **Add user**. Enter an email and a new, strong password that you and Wes will both use. Keep it in your password manager.
4. Under **Settings**, then **User actions**, turn off **Enable create (sign-up)**, so nobody else can make an account.

Don't send this password to me. You'll type it into the app yourselves.

## 3. Create the database

1. In the left menu, open **Firestore Database** and choose **Create database**.
2. If it asks for an edition, choose **Standard**.
3. For the location, choose **australia-southeast1 (Sydney)**. This can't be changed later.
4. Start in **production mode**.
5. Open the **Rules** tab, replace everything with the contents of `firestore.rules` from this folder, and choose **Publish**.

## 4. Get the web app settings

1. Open **Project settings** (the gear icon), and under **Your apps** choose the web icon (`</>`).
2. Name it `Salad Tower`. You don't need Firebase Hosting.
3. Copy the `firebaseConfig` block it shows, and send it to Claude. These settings aren't secret, because the rules from step 3 protect your data.

## 5. Install it on your phones

Once Claude has published the app, open its web address:

- **Pip's iPhone:** open it in Safari, tap **Share**, then **Add to Home Screen**. Open the app from the new icon and sign in there. A home screen app keeps its own storage, separate from Safari, so sign in from the icon.
- **Wes's Samsung:** open it in Chrome, tap the **⋮** menu, then **Add to Home screen** or **Install app**, and sign in.

## If something goes wrong

- **Forgotten password:** in Firebase, open **Authentication**, then **Users**, and reset it from the menu beside the account.
- **"Sync problem" in the top bar:** check the rules were published in step 3. Then look at **Settings** in the app for the error, and send it to Claude.
- **Keep backups anyway:** the Download backup button in Settings still works. Do one every month or so.
