<!-- rating.js -->
<script type="module">
export function renderStarRow({value=0, size=22, readOnly=false}={}) {
  const wrap = document.createElement('div');
  wrap.style.display='inline-flex';
  wrap.style.gap='6px';
  for (let i=1;i<=5;i++){
    const b = document.createElement('button');
    b.type='button';
    b.textContent = '★';
    b.style.fontSize = size+'px';
    b.style.lineHeight = 1;
    b.style.border = '0';
    b.style.background = 'transparent';
    b.style.cursor = readOnly ? 'default' : 'pointer';
    b.style.filter = i<=value ? 'grayscale(0)' : 'grayscale(1)';
    b.dataset.val = i;
    if (readOnly) b.disabled = true;
    wrap.appendChild(b);
  }
  return wrap;
}

/**
 * Mount a read-only aggregate line: "⭐ 4.6 (25 reviews)"
 * parentDocRef = doc(db, "<collection>", targetUid)
 */
export function mountAggregate({parentDocRef, container}) {
  const line = document.createElement('div');
  line.style.display='flex';
  line.style.alignItems='center';
  line.style.gap='8px';
  const stars = renderStarRow({value:0, size:18, readOnly:true});
  const label = document.createElement('span');
  label.style.fontWeight='600';
  label.textContent = 'No ratings yet';
  line.appendChild(stars);
  line.appendChild(label);
  container.replaceChildren(line);

  // live listen
  import("https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js").then(({onSnapshot})=>{
    onSnapshot(parentDocRef, (snap)=>{
      const d = snap.data() || {};
      const avg = Number(d.averageRating||0);
      const cnt = Number(d.ratingCount||0);
      // paint stars
      stars.querySelectorAll('button').forEach((b,i)=>{
        b.style.filter = (i<Math.round(avg)) ? 'grayscale(0)' : 'grayscale(1)';
      });
      label.textContent = cnt ? `${avg.toFixed(1)} (${cnt} review${cnt>1?'s':''})` : 'No ratings yet';
    });
  });
}

/**
 * Interactive rater (for rating other users)
 * - Prevent self-rating
 * - One rating per rater (updates allowed)
 * - Transactional average update (handles create/update)
 */
export function mountRater({db, auth, targetCollection, targetUid, container}) {
  const card = document.createElement('div');
  card.style.border='1px solid #ececec';
  card.style.borderRadius='12px';
  card.style.padding='12px';
  card.style.background='#fff';
  card.style.boxShadow='0 6px 18px rgba(0,0,0,.06)';
  const title = document.createElement('div');
  title.style.fontWeight='800';
  title.style.marginBottom='8px';
  title.textContent='Rate this profile';
  const starRow = renderStarRow({value:0, size:26, readOnly:false});
  starRow.style.marginBottom='8px';
  const txt = document.createElement('textarea');
  txt.placeholder = 'Optional: your feedback…';
  txt.style.width='100%'; txt.style.minHeight='72px';
  txt.style.border='1px solid #ddd'; txt.style.borderRadius='10px'; txt.style.padding='10px';
  txt.style.fontFamily='inherit';
  const btn = document.createElement('button');
  btn.textContent='Submit Rating';
  btn.style.marginTop='10px'; btn.style.padding='10px 14px';
  btn.style.border='0'; btn.style.borderRadius='10px'; btn.style.fontWeight='800';
  btn.style.background='#FFD700'; btn.style.cursor='pointer';

  const note = document.createElement('div');
  note.style.fontSize='.9rem';
  note.style.color='#555';
  note.style.marginTop='8px';

  card.append(title, starRow, txt, btn, note);
  container.replaceChildren(card);

  let starsSel = 0;
  starRow.addEventListener('click', (e)=>{
    const b = e.target.closest('button'); if(!b) return;
    starsSel = Number(b.dataset.val||0);
    starRow.querySelectorAll('button').forEach((x,i)=>{
      x.style.filter = (i < starsSel) ? 'grayscale(0)' : 'grayscale(1)';
    });
  });

  btn.addEventListener('click', async ()=>{
    const { doc, setDoc, getDoc, runTransaction, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js");
    const user = auth.currentUser;
    if (!user){ return alert('Please log in first.'); }
    if (user.uid === targetUid){ return alert('You cannot rate your own profile.'); }
    if (starsSel < 1 || starsSel > 5){ return alert('Select 1–5 stars.'); }

    const parentRef = doc(db, targetCollection, targetUid);
    const ratingRef = doc(db, targetCollection, targetUid, "ratings", user.uid);

    try{
      await runTransaction(db, async (tx)=>{
        const parentSnap = await tx.get(parentRef);
        const ratingSnap = await tx.get(ratingRef);

        const curAvg = Number(parentSnap.exists()? (parentSnap.data().averageRating||0) : 0);
        const curCnt = Number(parentSnap.exists()? (parentSnap.data().ratingCount||0) : 0);
        let sum = curAvg * curCnt;
        let count = curCnt;

        if (ratingSnap.exists()){
          const prev = Number(ratingSnap.data().stars||0);
          sum = sum - prev + starsSel; // replace
        } else {
          sum = sum + starsSel;
          count = curCnt + 1;
        }
        const newAvg = count ? (sum / count) : 0;

        tx.set(ratingRef, {
          raterId: user.uid,
          stars: starsSel,
          review: txt.value?.trim() || '',
          updatedAt: serverTimestamp(),
          createdAt: ratingSnap.exists()? ratingSnap.data().createdAt || serverTimestamp() : serverTimestamp()
        }, { merge:true });

        tx.set(parentRef, {
          averageRating: Number(newAvg.toFixed(3)),
          ratingCount: count
        }, { merge:true });
      });
      note.textContent = 'Thanks! Your rating was submitted.';
    }catch(err){
      console.error(err);
      alert('Failed to submit rating: ' + (err.message || err.code));
    }
  });
}
</script>
