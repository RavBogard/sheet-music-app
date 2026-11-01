# Drew — wedges, limits and the recording

Mix front of house in Mixing Station, the way you already do. The wedges also run through
**centralreform.live/monitor**: musicians on a bus ride their own wedge from their iPad, and you
control who's on which bus and how loud any wedge can go. Both apps talk to the same X32, so a move
in one shows up in the other.

## Once, on your iPad

1. In Safari, open **centralreform.live** and sign in with Google using your engineer account.
2. Tap Share, then **Add to Home Screen**. Open the app from that icon, then go to **Settings →
   Notifications → Push**, turn it on and allow it. If the bridge isn't running about 30 minutes
   before a service, you and Michael get a "Monitor bridge needs attention" alert.

## The pieces of /monitor you'll use

- **Configure → bus assignments.** Each bus lists the people on it. Tap **Add** to put a musician
  on a bus, or tap the × to remove them. Right now Daniel is on bus 5 and David is on bus 2. A new
  musician has to sign in to centralreform.live once before they show up in the list. If their
  account says it's waiting for approval, text Daniel.
- **Configure → Limits.** This is the loudest any wedge can go. It's set to about **−2 dB** for
  channel sends and the wedge master, for every bus, and you can give one bus its own limits. The
  bridge holds every move made from an iPad or from Claude to your limit, and the musician sees
  "Limited to … by the sound engineer's limit". Going above 0 dB asks you to confirm first.
  **Limits don't apply to Mixing Station or the desk.**
- **Engineer console** (`/monitor/engineer`). Shows every bus with the people on it and the loudest
  channels. Use **Ride this bus** to take over someone's wedge: for example, when David says the
  bass is low in his wedge. The **Bridge** card says Running or Not running, when the bridge was
  last heard from, and whether the watchdog is installed.
- **Saved mixes.** Musicians can save a mix and recall it next week. The app also keeps an "End of
  service" mix for each musician, under "After recent services". A double-tap on a fader puts it
  back at that person's last saved level. If they have no saved level, it goes to −6 dB, and never
  above your limit.

## Before the service (with Michael's checklist)

- The engineer console says the bridge is **Running**, and a musician's Monitor screen says
  **Connected**.
- The limits are where you want them.

## After the service: the recording

Put the service mix in the **Dropbox SERVICES** folder:
- Make a new folder named with the date and the service, for example `11.07_SAT MORNING` or
  `11.13_FRI NIGHT`.
- Save the mix as an **MP3** ending in `_V1` (a WAV is fine too). For a second pass, use `_V2`.

Claude cuts the full service into one clip per song and attaches each clip to its chart. Recordings
are public. Nothing plays during Perform.

## If the bridge is down

Musicians see "Controls are paused. Your wedge sounds the same as before." Their wedges keep the
last levels, and you can still mix everything in Mixing Station. To bring the bridge back:
1. Check that the studio PC is on and signed in to Windows.
2. Right-click the bridge's tray icon → **Quit Bridge**, then open **CentralReform Bridge** from
   the Start menu.
3. If the icon stays red, check that the X32 is on and on the network.

Text Daniel what happened.
