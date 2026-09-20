# How to Create the Required Firebase Index for Tasks

To power the new Global Tasks Dashboard (`/tasks`), Firestore requires a "Composite Index" so it can sort and filter tasks efficiently across all setlists. 

There are two ways to create this index:

### Method 1: The Easy Way (Auto-Link)
This method is usually the fastest and least error-prone.
1. Run the app locally (`npm run dev`) or go to the published version.
2. Sign in to the app.
3. Navigate to the new `/tasks` page.
4. **Open your browser's Developer Tools** (F12 or Right Click -> Inspect).
5. Go to the **Console** tab.
6. You will see an error message from Firebase that looks like this:
   `FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/...`
7. **Click that link!** It will take you directly to your Firebase Console and pre-fill the exact index fields you need.
8. Click **Create Index** and wait a few minutes for it to build.

---

### Method 2: Manual Creation (Firebase Console)
If you don't see the link or prefer to do it manually, follow these steps:
1. Go to your [Firebase Console](https://console.firebase.google.com/).
2. Select the `sheet-music-app` project.
3. In the left sidebar, click on **Firestore Database** (under Build).
4. Go to the **Indexes** tab at the top of the Firestore page.
5. Click the **Add Index** button.
6. Fill out the form exactly as follows:
   * **Collection ID**: `tasks`
   * **Fields to index**:
     1. Field path: `assigneeId` | Order: **Ascending**
     2. Field path: `status` | Order: **Ascending**
     3. Field path: `eventDate` | Order: **Ascending**
   * **Query scopes**: Collection
7. Click **Create Index**.

Wait about 3-5 minutes for the status to change from "Building" to "Enabled". Once enabled, the `/tasks` page will load properly!
