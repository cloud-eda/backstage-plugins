
[{"id":1,"result":"CONDITIONAL","pluginId":"catalog","resourceType":"catalog-entity","conditions":{"rule":"HAS_ANNOTATION","resourceType":"catalog-entity","params":{"annotation":"temp"}},"roleEntityRef":"role:default/div","permissionMapping":["read"]},{"id":2,"result":"CONDITIONAL","pluginId":"catalog","resourceType":"catalog-entity","conditions":{"allOf":[{"rule":"HAS_ANNOTATION","resourceType":"catalog-entity","params":{"annotation":"temp"}},{"rule":"IS_ENTITY_KIND","resourceType":"catalog-entity","params":{"kinds":["api","component"]}}]},"roleEntityRef":"role:default/div","permissionMapping":["read","delete"]},{"id":3,"result":"CONDITIONAL","pluginId":"catalog","resourceType":"catalog-entity","conditions":{"not":{"rule":"HAS_ANNOTATION","resourceType":"catalog-entity","params":{"annotation":"temp"}}},"roleEntityRef":"role:default/div","permissionMapping":["read","delete","update"]}]


## condition 1.

curl -X POST "http://localhost:7007/api/permission/roles/conditions" -d '{"result":"CONDITIONAL","pluginId":"catalog","resourceType":"catalog-entity","conditions":{"rule":"HAS_ANNOTATION","resourceType":"catalog-entity","params":{"annotation":"temp"}},"roleEntityRef":"role:default/div","permissionMapping":["read"]}' -H "Content-Type: application/json" -H "Authorization: Bearer $token" -v


## condition 2
curl -X POST "http://localhost:7007/api/permission/roles/conditions" -d '{"id":2,"result":"CONDITIONAL","pluginId":"catalog","resourceType":"catalog-entity","conditions":{"allOf":[{"rule":"HAS_ANNOTATION","resourceType":"catalog-entity","params":{"annotation":"temp"}},{"rule":"IS_ENTITY_KIND","resourceType":"catalog-entity","params":{"kinds":["api","component"]}}]},"roleEntityRef":"role:default/div","permissionMapping":["read","delete"]}' -H "Content-Type: application/json" -H "Authorization: Bearer $token" -v
#should deny

## condition 3
curl -X POST "http://localhost:7007/api/permission/roles/conditions" -d '{"result":"CONDITIONAL","pluginId":"catalog","resourceType":"catalog-entity","conditions":{"not":{"rule":"HAS_ANNOTATION","resourceType":"catalog-entity","params":{"annotation":"temp"}}},"roleEntityRef":"role:default/div","permissionMapping":["read","delete","update"]}' -H "Content-Type: application/json" -H "Authorization: Bearer $token" -v
#should deny
