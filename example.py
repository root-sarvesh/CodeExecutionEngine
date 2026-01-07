class Solution:
    def numIslands(self, grid: List[List[str]]) -> int:
        row,col=len(grid),len(grid[0])
        visited=[0]*col
        noofislands=0
        def dfs(r,c):
            if r not in range(row) or c not in range(col) or grid[r][c]!='1':
                return 
            else:
                visited[c]=1
                dfs(r+1,c)
                dfs(r,c+1)
                dfs(r-1,c)
                dfs(r,c-1)
            

        for u in range(len(row)):
            for v in range(len(col)):
                if grid[u][v]=='1' and not visited[v]:
                    noofislands+=1
                    dfs(u,v)
                    

    return noofislands

        