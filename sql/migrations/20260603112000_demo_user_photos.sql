-- Demo avatars for visual review.
-- Keeps existing uploaded photos intact and fills only users without photo_url.

with demo_photos(name_pattern, photo_url) as (
  values
    ('%ramon%', 'https://randomuser.me/api/portraits/men/32.jpg'),
    ('%ana%', 'https://randomuser.me/api/portraits/women/68.jpg'),
    ('%elisa%', 'https://randomuser.me/api/portraits/women/44.jpg'),
    ('%joão%', 'https://randomuser.me/api/portraits/men/76.jpg'),
    ('%joao%', 'https://randomuser.me/api/portraits/men/76.jpg'),
    ('%bruno%', 'https://randomuser.me/api/portraits/men/45.jpg'),
    ('%carla%', 'https://randomuser.me/api/portraits/women/65.jpg'),
    ('%mariana%', 'https://randomuser.me/api/portraits/women/12.jpg'),
    ('%carlos%', 'https://randomuser.me/api/portraits/men/22.jpg'),
    ('%pedro%', 'https://randomuser.me/api/portraits/men/14.jpg'),
    ('%fernanda%', 'https://randomuser.me/api/portraits/women/26.jpg'),
    ('%bianca%', 'https://randomuser.me/api/portraits/women/79.jpg')
)
update public.users u
set photo_url = d.photo_url
from demo_photos d
where u.photo_url is null
  and lower(u.name) like d.name_pattern;

with numbered_users as (
  select
    id,
    row_number() over (order by created_at, id) as rn
  from public.users
  where photo_url is null
),
fallback_photos(idx, photo_url) as (
  values
    (1, 'https://randomuser.me/api/portraits/women/32.jpg'),
    (2, 'https://randomuser.me/api/portraits/men/41.jpg'),
    (3, 'https://randomuser.me/api/portraits/women/51.jpg'),
    (4, 'https://randomuser.me/api/portraits/men/52.jpg'),
    (5, 'https://randomuser.me/api/portraits/women/58.jpg'),
    (6, 'https://randomuser.me/api/portraits/men/64.jpg'),
    (7, 'https://randomuser.me/api/portraits/women/71.jpg'),
    (8, 'https://randomuser.me/api/portraits/men/81.jpg')
)
update public.users u
set photo_url = f.photo_url
from numbered_users n
join fallback_photos f on f.idx = ((n.rn - 1) % 8) + 1
where u.id = n.id
  and u.photo_url is null;
