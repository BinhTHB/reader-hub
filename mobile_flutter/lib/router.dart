import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'services/supabase_service.dart';
import 'screens/auth_screen.dart';
import 'screens/home_screen.dart';
import 'screens/story_detail_screen.dart';
import 'screens/reader_screen.dart';

class AppRouter {
  AppRouter._();

  static final GlobalKey<NavigatorState> _rootNavigatorKey =
      GlobalKey<NavigatorState>(debugLabel: 'root');

  static GoRouter create() {
    return GoRouter(
      navigatorKey: _rootNavigatorKey,
      initialLocation: '/home',
      redirect: (context, state) {
        final isAuthenticated = SupabaseService.isAuthenticated;
        final isAuthRoute = state.matchedLocation == '/auth';

        if (!isAuthenticated && !isAuthRoute) {
          return '/auth';
        }
        if (isAuthenticated && isAuthRoute) {
          return '/home';
        }
        return null;
      },
      routes: [
        GoRoute(
          path: '/auth',
          builder: (context, state) => const AuthScreen(),
        ),
        GoRoute(
          path: '/home',
          builder: (context, state) => const HomeScreen(),
          routes: [
            GoRoute(
              path: 'story/:slug',
              builder: (context, state) => StoryDetailScreen(
                slug: state.pathParameters['slug']!,
              ),
              routes: [
                GoRoute(
                  path: 'reader',
                  builder: (context, state) {
                    final extra = state.extra as Map<String, dynamic>;
                    return ReaderScreen(
                      chapter: extra['chapter'] as Map<String, dynamic>,
                      storyTitle: extra['storyTitle'] as String,
                    );
                  },
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  static void goAuth(BuildContext context) => context.go('/auth');
  static void goHome(BuildContext context) => context.go('/home');
  static void goStory(BuildContext context, String slug) =>
      context.go('/home/story/$slug');
  static void goReader(
    BuildContext context,
    String slug,
    Map<String, dynamic> chapter,
    String storyTitle,
  ) =>
      context.go(
        '/home/story/$slug/reader',
        extra: {'chapter': chapter, 'storyTitle': storyTitle},
      );
}
