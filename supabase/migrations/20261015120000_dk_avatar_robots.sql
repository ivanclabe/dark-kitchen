-- ADR 0062: the avatar gallery gains five faces of the robot of Quanela.
-- Only the list of allowed keys grows: no existing value changes, nothing is deleted.
-- Keep equal to PERSON_AVATAR_KEYS in src/shared/avatars/catalog.ts (catalog.test.ts checks it).

alter table dk_users drop constraint dk_users_avatar_key_check;

alter table dk_users
  add constraint dk_users_avatar_key_check check (
    avatar_key in (
      'chef-classic', 'chef-bun', 'baker', 'barista', 'rider', 'cashier', 'grill-master', 'sushi-chef', 'pizzaiolo', 'manager',
      'waiter', 'grandma', 'curly', 'hijab', 'beanie', 'headphones', 'cap', 'braids', 'robot', 'cat-chef',
      'robot-wink', 'robot-love', 'robot-idea', 'robot-surprised', 'robot-sleepy'
    )
  );
