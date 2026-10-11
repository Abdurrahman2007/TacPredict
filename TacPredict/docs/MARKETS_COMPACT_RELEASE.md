# Markets-only compact/touch release
- Removed Markets search input, its icon, navigation-on-input and hidden q filtering.
  q remains an optional TypeScript compatibility field for older Home links but is not returned by validation or used to filter listings.
- Dedicated /search page and global navigation unchanged.
- Header/sections/preview cards compacted with route-scoped CSS, no global theme changes.
- Category chips44px minimum, sorting links46px; mobile font13–15px, iOS-style horizontal touch scrolling/pressed states, keyboard focus and reduced motion.
- All eight categories (including Other) remain selectable. Invalid categories fall back to All.
- Native listings appear first rather than being buried below discovery metadata.
- Trending/Most active native ranking uses exact native volume atomic strings; Most active shows only native listings because source metadata has no actual TacPredict trade activity.
- Ending soon uses real close deadlines. New uses available native creation/discovery update/preview observation timestamps. Metadata never gets fabricated traded volume or probabilities.
- Sort prop added to preview/event components; their defaults preserve Home/Search behavior.
- Three sorting unit tests, TypeScript and production build pass.
- Live320/375/1200px: all8 category links and4 sorting links tested; zero Markets search inputs, no document overflow, no JS errors; /search still has its input. Most active excludes discovery-only sections.
