/* 2Gather v39 Build 17 - invalidacao pos-gravacao e eventos de mutacao */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.mutation={
 map:{'v39.people.save':['v39.people.list','v39.core'],'v39.groups.save':['v39.groups.list','v39.core'],'v39.announcements.save':['v39.announcements.list'],'v39.prayers.save':['v39.prayers.list']},
 after:function(action,data){if(V.cache&&this.map[action])V.cache.clear();window.dispatchEvent(new CustomEvent('2gather:v39-mutation',{detail:{action:action,data:data||null}}));return data;},
 targets:function(action){return this.map[action]||[];}
};})();
